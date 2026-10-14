import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { pool, type Queryable } from "../db/pool.js";

afterAll(() => pool.end());

describe("GET /health", () => {
  it("returns 200 when Postgres answers (needs `npm run db:up`)", async () => {
    const res = await request(createApp({ db: pool })).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok" });
  });

  it("returns 503 when the database is unreachable", async () => {
    const deadDb: Queryable = { query: () => Promise.reject(new Error("ECONNREFUSED")) } as Queryable;
    const res = await request(createApp({ db: deadDb })).get("/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "degraded", db: "unreachable" });
  });
});
