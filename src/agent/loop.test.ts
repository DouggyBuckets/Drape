import type Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import { ensureUser, seedFixtures } from "../items/fixtures.js";
import { searchItems } from "../items/repository.js";
import { fixedWeather } from "../weather/weather.js";
import { type CreateMessage, runOutfitAgent } from "./loop.js";

type Block = Anthropic.Beta.BetaContentBlock;
let callId = 0;
const toolUse = (name: string, input: unknown): Block =>
  ({ type: "tool_use", id: `toolu_${++callId}`, name, input }) as Block;
const text = (t: string): Block => ({ type: "text", text: t, citations: null }) as Block;

function message(content: Block[], stop_reason: Anthropic.Beta.BetaStopReason = "tool_use"): Anthropic.Beta.BetaMessage {
  return {
    id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason,
    usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Beta.BetaMessage;
}

/** A fake model that replays scripted turns and records what it was sent. */
function scripted(turns: (Anthropic.Beta.BetaMessage | (() => Anthropic.Beta.BetaMessage))[]) {
  const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const createMessage: CreateMessage = async (params) => {
    calls.push(structuredClone(params));
    const turn = turns[Math.min(calls.length - 1, turns.length - 1)]!;
    return typeof turn === "function" ? turn() : turn;
  };
  return { createMessage, calls };
}

let ids: { top: string; bottom: string; shoes: string; jacket: string };
let userId: string;
let otherUserId: string;
const weather = fixedWeather({ chicago: { highF: 48, lowF: 40, precipitationChancePct: 10 } });
const deps = (createMessage: CreateMessage, maxIterations?: number) =>
  ({ db: pool, userId, weather, createMessage, maxIterations, now: () => new Date("2026-10-20T12:00:00Z") });
const submit = (item_ids: string[]) =>
  toolUse("submit_outfit", { item_ids, temperature_f: 45, target_formality: 3, explanation: "Smart casual with a jacket." });

beforeAll(async () => {
  await pool.query("TRUNCATE users, wardrobe_items CASCADE");
  userId = await ensureUser(pool, "owner@example.com");
  otherUserId = await ensureUser(pool, "other@example.com");
  await seedFixtures(pool, userId);
  const one = async (nameContains: string) => (await searchItems(pool, userId, { nameContains }))[0]!.id;
  ids = {
    top: await one("merino"), bottom: await one("khaki chinos"),
    shoes: await one("leather lace-up boots"), jacket: await one("suede bomber"),
  };
});
afterAll(() => pool.end());

describe("runOutfitAgent", () => {
  it("runs parallel tool calls, returns all results in one message, and stops on a valid submit", async () => {
    const { createMessage, calls } = scripted([
      message([text("Searching."), toolUse("search_wardrobe", { category: "top" }), toolUse("get_weather", { location: "Chicago" })]),
      () => message([submit([ids.top, ids.bottom, ids.shoes, ids.jacket])]),
    ]);
    const r = await runOutfitAgent({ request: "dinner, smart casual", location: "Chicago" }, deps(createMessage));

    expect(r.status).toBe("ok");
    expect(r.iterations).toBe(2);
    expect(r.outfit?.items.map((i) => i.id)).toEqual([ids.top, ids.bottom, ids.shoes, ids.jacket]);
    expect(r.outfit?.warnings).toEqual([]);

    const secondCall = calls[1]!.messages;
    const results = secondCall[2]!.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results.map((b) => b.type)).toEqual(["tool_result", "tool_result"]);
    expect(JSON.parse(results[1]!.content as string)).toMatchObject({ highF: 48 });
    expect(r.usage).toEqual({ inputTokens: 200, outputTokens: 20, cacheReadTokens: 100, cacheWriteTokens: 0 });
  });

  it("rejects a hallucinated id with an error result, then accepts the corrected outfit", async () => {
    const fake = "11111111-1111-4111-8111-111111111111";
    const { createMessage, calls } = scripted([
      message([submit([ids.top, ids.bottom, fake])]),
      message([submit([ids.top, ids.bottom, ids.shoes, ids.jacket])]),
    ]);
    const r = await runOutfitAgent({ request: "dinner, 45 degrees, smart casual" }, deps(createMessage));

    expect(r.status).toBe("ok");
    const rejection = calls[1]!.messages[2]!.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(rejection[0]!.is_error).toBe(true);
    expect(JSON.parse(rejection[0]!.content as string)).toMatchObject({ accepted: false, unknown_ids: [fake] });
    expect(r.outfit?.items.every((i) => i.id !== fake)).toBe(true);
  });

  it("accepts a structurally valid outfit with fit problems as warnings", async () => {
    const { createMessage } = scripted([message([submit([ids.top, ids.bottom, ids.shoes])])]);
    const r = await runOutfitAgent({ request: "dinner, 45 degrees" }, deps(createMessage));
    expect(r.status).toBe("ok");
    expect(r.outfit?.warnings.map((w) => w.rule)).toEqual(["outerwear_when_cold"]);
  });

  it("stops at the iteration cap", async () => {
    const { createMessage, calls } = scripted([message([toolUse("search_wardrobe", {})])]);
    const r = await runOutfitAgent({ request: "anything" }, deps(createMessage, 3));
    expect(r).toMatchObject({ status: "max_iterations", outfit: null, iterations: 3 });
    expect(calls).toHaveLength(3);
  });

  it("nudges once when the model ends its turn without submitting", async () => {
    const { createMessage, calls } = scripted([
      message([text("Here is an outfit: the sweater and chinos.")], "end_turn"),
      message([submit([ids.top, ids.bottom, ids.shoes, ids.jacket])]),
    ]);
    const r = await runOutfitAgent({ request: "dinner, 45 degrees" }, deps(createMessage));
    expect(r.status).toBe("ok");
    expect(calls[1]!.messages.at(-1)).toEqual({ role: "user", content: expect.stringContaining("submit_outfit") });
    expect(r.trace.map((t) => t.type)).toEqual(["text", "nudge", "tool_call"]);
  });

  it("turns invalid tool input and tool exceptions into error results instead of crashing", async () => {
    const { createMessage, calls } = scripted([
      message([toolUse("search_wardrobe", { warmth_min: 9 }), toolUse("get_weather", { location: "Atlantis" }), toolUse("nope", {})]),
      message([submit([ids.top, ids.bottom, ids.shoes, ids.jacket])]),
    ]);
    const r = await runOutfitAgent({ request: "x" }, deps(createMessage));
    expect(r.status).toBe("ok");
    const results = calls[1]!.messages[2]!.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results.map((b) => b.is_error)).toEqual([true, true, true]);
    expect(results.map((b) => JSON.parse(b.content as string).error)).toEqual([
      "Invalid input", "Unknown location: Atlantis", "Unknown tool: nope",
    ]);
  });

  it("returns refused without running tools", async () => {
    const { createMessage } = scripted([message([], "refusal")]);
    expect((await runOutfitAgent({ request: "x" }, deps(createMessage))).status).toBe("refused");
  });

  it("only lets the agent see and submit the session user's items", async () => {
    // Another user's agent searches, then tries to submit this user's (real) item ids.
    const { createMessage, calls } = scripted([
      message([toolUse("search_wardrobe", {})]),
      message([submit([ids.top, ids.bottom, ids.shoes, ids.jacket])]),
      message([text("I can't find any items.")], "end_turn"),
    ]);
    const r = await runOutfitAgent({ request: "x" }, { ...deps(createMessage, 3), userId: otherUserId });

    const search = JSON.parse((calls[1]!.messages[2]!.content as Anthropic.Beta.BetaToolResultBlockParam[])[0]!.content as string);
    expect(search).toEqual({ count: 0, items: [] });
    const submitResult = (calls[2]!.messages[4]!.content as Anthropic.Beta.BetaToolResultBlockParam[])[0]!;
    expect(submitResult.is_error).toBe(true);
    expect(JSON.parse(submitResult.content as string).unknown_ids).toHaveLength(4);
    expect(r.outfit).toBeNull();
  });

  it("sends history back unchanged, including thinking blocks", async () => {
    const thinking = { type: "thinking", thinking: "", signature: "sig-abc" } as unknown as Block;
    const first = message([thinking, toolUse("search_wardrobe", { category: "shoes" })]);
    const { createMessage, calls } = scripted([first, message([submit([ids.top, ids.bottom, ids.shoes, ids.jacket])])]);
    await runOutfitAgent({ request: "x" }, deps(createMessage));
    expect(calls[1]!.messages[1]).toEqual({ role: "assistant", content: first.content });
  });
});
