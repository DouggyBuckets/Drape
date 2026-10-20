import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { testApp } from "../../test/helpers.js";
import type { AgentRequest, AgentResult } from "../agent/loop.js";
import { pool } from "../db/pool.js";

afterAll(() => pool.end());

const result = (status: AgentResult["status"]): AgentResult => ({
  status, outfit: null, iterations: 1, models: ["claude-opus-5-5"], trace: [],
  usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
});

describe("POST /outfits", () => {
  it("passes the trimmed request to the agent and returns 200 on success", async () => {
    const seen: AgentRequest[] = [];
    const app = testApp({ runAgent: async (r) => (seen.push(r), result("ok")) });
    const res = await request(app).post("/outfits").send({ request: "  dinner, 45 degrees  ", location: "Chicago" });
    expect(res.status).toBe(200);
    expect(seen).toEqual([{ request: "dinner, 45 degrees", location: "Chicago" }]);
  });

  it("returns 422 when the agent can't produce an outfit", async () => {
    const res = await request(testApp({ runAgent: async () => result("max_iterations") })).post("/outfits").send({ request: "x" });
    expect(res.status).toBe(422);
    expect(res.body.status).toBe("max_iterations");
  });

  it("validates the body", async () => {
    const app = testApp({ runAgent: async () => result("ok") });
    expect((await request(app).post("/outfits").send({})).status).toBe(400);
    expect((await request(app).post("/outfits").send({ request: "x".repeat(501) })).status).toBe(400);
  });
});
