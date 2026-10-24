import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { signedIn, testApp } from "../../test/helpers.js";
import type { AgentResult, TraceEvent } from "../agent/loop.js";
import { pool } from "../db/pool.js";
import { DEFAULT_LIMITS } from "../limits/limits.js";
import type { RunAgent } from "./outfits.js";

beforeEach(() => pool.query("TRUNCATE users, usage_events CASCADE"));
afterAll(() => pool.end());

const usage = { inputTokens: 10_000, outputTokens: 1_000, cacheReadTokens: 0, cacheWriteTokens: 0 };
const result = (status: AgentResult["status"], trace: TraceEvent[] = []): AgentResult =>
  ({ status, outfit: null, iterations: 2, models: ["claude-opus-5-5"], trace, usage });

const step = (name: string): TraceEvent =>
  ({ iteration: 1, type: "tool_call", name, input: {}, output: {}, isError: false });

/** Parses a complete text/event-stream body into [event, data] pairs. */
function parseEvents(body: string) {
  return body.trim().split("\n\n").map((frame) => {
    const event = /^event: (.*)$/m.exec(frame)![1];
    const data = JSON.parse(/^data: (.*)$/m.exec(frame)![1]!);
    return [event, data] as const;
  });
}

describe("POST /outfits/stream", () => {
  it("streams each step, then the result, and records the cost", async () => {
    const runAgent: RunAgent = async (_req, _user, opts) => {
      const steps = [step("search_wardrobe"), step("submit_outfit")];
      for (const s of steps) opts?.onEvent?.(s);
      return result("ok", steps);
    };
    const { agent } = await signedIn(testApp({ runAgent }));
    const res = await agent.post("/outfits/stream").send({ request: "dinner" });

    expect(res.headers["content-type"]).toContain("text/event-stream");
    const events = parseEvents(res.text);
    expect(events.map(([e, d]) => (e === "step" ? d.name : e))).toEqual(["search_wardrobe", "submit_outfit", "result"]);
    expect(events.at(-1)![1].status).toBe("ok");
    expect((await pool.query("SELECT cost_usd FROM usage_events WHERE kind = 'outfit'")).rows).toEqual([{ cost_usd: "0.0600" }]);
  });

  it("returns quota and validation errors as JSON before streaming", async () => {
    const app = testApp({ runAgent: async () => result("ok"), limits: { ...DEFAULT_LIMITS, signupsPerIpPerDay: 100, outfitsPerUserPerDay: 1 } });
    const { agent } = await signedIn(app);
    expect((await agent.post("/outfits/stream").send({})).status).toBe(400);
    await agent.post("/outfits/stream").send({ request: "x" });
    const limited = await agent.post("/outfits/stream").send({ request: "x" });
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe("outfit_limit");
  });

  it("requires a session", async () => {
    expect((await request(testApp()).post("/outfits/stream").send({ request: "x" })).status).toBe(401);
  });

  it("cancels the agent when the client disconnects, and still records what it spent", async () => {
    let sawAbort!: () => void;
    const aborted = new Promise<void>((r) => (sawAbort = r));
    const runAgent: RunAgent = (_req, _user, opts) =>
      new Promise((resolve) => {
        opts?.onEvent?.(step("search_wardrobe"));
        opts?.signal?.addEventListener("abort", () => {
          sawAbort();
          resolve(result("cancelled"));
        });
      });

    // A real server and fetch, so the client can drop the connection mid-stream.
    const server = testApp({ runAgent }).listen(0);
    try {
      const base = `http://localhost:${(server.address() as AddressInfo).port}`;
      const signup = await fetch(`${base}/auth/signup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "stream@example.com", password: "a long enough password" }),
      });
      const cookie = signup.headers.get("set-cookie")!.split(";")[0]!;
      const controller = new AbortController();
      const res = await fetch(`${base}/outfits/stream`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ request: "dinner" }),
        signal: controller.signal,
      });
      const reader = res.body!.getReader();
      const first = new TextDecoder().decode((await reader.read()).value);
      expect(first).toContain("event: step");

      controller.abort();
      await aborted;
      // Give the handler a moment to record the cost after the agent resolves.
      await new Promise((r) => setTimeout(r, 50));
      expect((await pool.query("SELECT cost_usd FROM usage_events WHERE kind = 'outfit'")).rows).toEqual([{ cost_usd: "0.0600" }]);
    } finally {
      server.close();
    }
  });
});
