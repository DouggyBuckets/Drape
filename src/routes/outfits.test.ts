import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { signedIn, testApp } from "../../test/helpers.js";
import type { AgentRequest, AgentResult } from "../agent/loop.js";
import { pool } from "../db/pool.js";

beforeEach(() => pool.query("TRUNCATE users CASCADE"));
afterAll(() => pool.end());

const result = (status: AgentResult["status"]): AgentResult => ({
  status, outfit: null, iterations: 1, models: ["claude-opus-5-5"], trace: [],
  usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
});

describe("POST /outfits", () => {
  it("passes the trimmed request and the session's user id to the agent", async () => {
    const seen: [AgentRequest, string][] = [];
    const app = testApp({ runAgent: async (r, userId) => (seen.push([r, userId]), result("ok")) });
    const { agent, user } = await signedIn(app);
    const res = await agent.post("/outfits").send({ request: "  dinner, 45 degrees  ", location: "Chicago" });
    expect(res.status).toBe(200);
    expect(seen).toEqual([[{ request: "dinner, 45 degrees", location: "Chicago" }, user.id]]);
  });

  it("requires a session", async () => {
    const res = await request(testApp({ runAgent: async () => result("ok") })).post("/outfits").send({ request: "x" });
    expect(res.status).toBe(401);
  });

  it("returns 422 when the agent can't produce an outfit", async () => {
    const { agent } = await signedIn(testApp({ runAgent: async () => result("max_iterations") }));
    const res = await agent.post("/outfits").send({ request: "x" });
    expect(res.status).toBe(422);
    expect(res.body.status).toBe("max_iterations");
  });

  it("validates the body", async () => {
    const { agent } = await signedIn(testApp({ runAgent: async () => result("ok") }));
    expect((await agent.post("/outfits").send({})).status).toBe(400);
    expect((await agent.post("/outfits").send({ request: "x".repeat(501) })).status).toBe(400);
  });
});
