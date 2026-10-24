import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { makePng, signedIn, testApp } from "../../test/helpers.js";
import type { AgentResult } from "../agent/loop.js";
import { createUser } from "../auth/users.js";
import { pool } from "../db/pool.js";
import { DEFAULT_LIMITS, type LimitsConfig } from "./limits.js";

beforeEach(() => pool.query("TRUNCATE users, usage_events CASCADE"));
afterAll(() => pool.end());

const okResult = (): AgentResult => ({
  status: "ok", outfit: null, iterations: 3, models: ["claude-opus-5-5"], trace: [],
  // 10k input + 1k output at list price ≈ $0.06
  usage: { inputTokens: 10_000, outputTokens: 1_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
});

const appWith = (limits: Partial<LimitsConfig> = {}) =>
  testApp({
    runAgent: async () => okResult(),
    limits: { ...DEFAULT_LIMITS, signupsPerIpPerDay: 1000, ...limits },
  });

async function demoAccount() {
  return createUser(pool, "demo@example.com", "owner password 123", { isDemo: true });
}

describe("demo account", () => {
  it("gives visitors a read-only session that can request outfits but not upload", async () => {
    const demo = await demoAccount();
    const visitor = request.agent(appWith());
    expect((await visitor.post("/auth/demo")).body).toMatchObject({ id: demo.id, readOnly: true });
    expect((await visitor.get("/auth/me")).body.readOnly).toBe(true);

    expect((await visitor.post("/outfits").send({ request: "dinner" })).status).toBe(200);
    const up = await visitor.post("/items").attach("image", await makePng(10, 10), "x.png");
    expect(up.status).toBe(403);
    expect(up.body.error).toBe("read_only_demo");
  });

  it("blocks deletes from demo sessions", async () => {
    const demo = await demoAccount();
    const { rows } = await pool.query(
      `INSERT INTO wardrobe_items (user_id, name, category, color, formality, warmth, seasons, extraction_model, extraction)
       VALUES ($1, 'tee', 'top', 'white', 2, 2, '{summer}', 'fixture', '{}') RETURNING id`, [demo.id]);
    const visitor = request.agent(appWith());
    await visitor.post("/auth/demo");
    expect((await visitor.delete(`/items/${rows[0].id}`)).status).toBe(403);
  });

  it("gives the owner's password login full access to the same account", async () => {
    await demoAccount();
    const owner = request.agent(appWith());
    await owner.post("/auth/login").send({ email: "demo@example.com", password: "owner password 123" });
    expect((await owner.get("/auth/me")).body.readOnly).toBe(false);
    expect((await owner.post("/items").attach("image", await makePng(10, 10), "x.png")).status).toBe(201);
  });

  it("returns 404 when no demo account exists", async () => {
    expect((await request(appWith()).post("/auth/demo")).status).toBe(404);
  });

  it("limits demo outfits per visitor IP", async () => {
    await demoAccount();
    const visitor = request.agent(appWith({ demoOutfitsPerIpPerDay: 2 }));
    await visitor.post("/auth/demo");
    for (let i = 0; i < 2; i++) expect((await visitor.post("/outfits").send({ request: "x" })).status).toBe(200);
    const third = await visitor.post("/outfits").send({ request: "x" });
    expect(third.status).toBe(429);
    expect(third.body.error).toBe("demo_limit");
  });
});

describe("per-user quotas", () => {
  it("limits outfit requests per user per day", async () => {
    const { agent } = await signedIn(appWith({ outfitsPerUserPerDay: 1 }));
    expect((await agent.post("/outfits").send({ request: "x" })).status).toBe(200);
    expect((await agent.post("/outfits").send({ request: "x" })).body.error).toBe("outfit_limit");
  });

  it("limits uploads per user per day", async () => {
    const { agent } = await signedIn(appWith({ uploadsPerUserPerDay: 1 }));
    expect((await agent.post("/items").attach("image", await makePng(10, 10), "x.png")).status).toBe(201);
    const second = await agent.post("/items").attach("image", await makePng(10, 10), "x.png");
    expect([second.status, second.body.error]).toEqual([429, "upload_limit"]);
  });

  it("counts only the last 24 hours", async () => {
    const { agent, user } = await signedIn(appWith({ outfitsPerUserPerDay: 1 }));
    await pool.query("INSERT INTO usage_events (user_id, ip, kind, created_at) VALUES ($1, '127.0.0.1', 'outfit', now() - interval '25 hours')", [user.id]);
    expect((await agent.post("/outfits").send({ request: "x" })).status).toBe(200);
  });

  it("limits sign-ups per IP", async () => {
    const app = appWith({ signupsPerIpPerDay: 2 });
    await signedIn(app);
    await signedIn(app);
    const res = await request(app).post("/auth/signup").send({ email: "third@example.com", password: "a long enough password" });
    expect([res.status, res.body.error]).toEqual([429, "signup_limit"]);
  });
});

describe("global daily spend cap", () => {
  it("records each request's estimated cost", async () => {
    const { agent } = await signedIn(appWith());
    await agent.post("/outfits").send({ request: "x" });
    const { rows } = await pool.query("SELECT kind, cost_usd FROM usage_events WHERE kind = 'outfit'");
    expect(rows).toEqual([{ kind: "outfit", cost_usd: "0.0600" }]);
  });

  it("blocks all model calls once the last 24h of spend reaches the cap", async () => {
    const { agent } = await signedIn(appWith({ dailySpendCapUsd: 0.1 }));
    expect((await agent.post("/outfits").send({ request: "x" })).status).toBe(200); // spend now $0.06
    expect((await agent.post("/outfits").send({ request: "x" })).status).toBe(200); // $0.12
    const blocked = await agent.post("/outfits").send({ request: "x" });
    expect([blocked.status, blocked.body.error]).toEqual([429, "daily_budget_reached"]);
  });
});
