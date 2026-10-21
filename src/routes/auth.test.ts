import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testApp } from "../../test/helpers.js";
import { pool } from "../db/pool.js";

beforeEach(() => pool.query("TRUNCATE users CASCADE"));
afterAll(() => pool.end());

const creds = { email: "Ada@Example.com", password: "a long enough password" };
const sessionCookie = (res: request.Response) =>
  ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("drape_session="));

describe("auth", () => {
  it("signs up, sets an httpOnly SameSite cookie, and recognizes the session", async () => {
    const agent = request.agent(testApp());
    const signup = await agent.post("/auth/signup").send(creds);
    expect(signup.status).toBe(201);
    expect(signup.body).toEqual({ id: expect.any(String), email: "Ada@Example.com", isDemo: false });
    expect(signup.body).not.toHaveProperty("password_hash");
    expect(sessionCookie(signup)).toMatch(/HttpOnly/);
    expect(sessionCookie(signup)).toMatch(/SameSite=Lax/);

    const me = await agent.get("/auth/me");
    expect(me.body.email).toBe("Ada@Example.com");
  });

  it("stores only a hash of the session token", async () => {
    const res = await request(testApp()).post("/auth/signup").send(creds);
    const token = decodeURIComponent(sessionCookie(res)!.split(";")[0]!.split("=")[1]!);
    const { rows } = await pool.query("SELECT token_hash FROM sessions");
    expect(rows).toHaveLength(1);
    expect(Buffer.from(rows[0].token_hash).toString("base64url")).not.toBe(token);
  });

  it("rejects duplicate emails case-insensitively", async () => {
    await request(testApp()).post("/auth/signup").send(creds);
    const res = await request(testApp()).post("/auth/signup").send({ ...creds, email: "ada@example.COM" });
    expect(res.status).toBe(409);
  });

  it("validates signup input", async () => {
    expect((await request(testApp()).post("/auth/signup").send({ email: "nope", password: "a long enough password" })).status).toBe(400);
    expect((await request(testApp()).post("/auth/signup").send({ email: "a@b.co", password: "short" })).status).toBe(400);
  });

  it("logs in with the right password, case-insensitive email", async () => {
    await request(testApp()).post("/auth/signup").send(creds);
    const res = await request(testApp()).post("/auth/login").send({ email: "ada@example.com", password: creds.password });
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toBeDefined();
  });

  it("gives the same 401 for a wrong password and an unknown email", async () => {
    await request(testApp()).post("/auth/signup").send(creds);
    const wrong = await request(testApp()).post("/auth/login").send({ ...creds, password: "not the password" });
    const unknown = await request(testApp()).post("/auth/login").send({ email: "who@example.com", password: "whatever123" });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body).toEqual(unknown.body);
  });

  it("logs out by deleting the session", async () => {
    const agent = request.agent(testApp());
    await agent.post("/auth/signup").send(creds);
    expect((await agent.post("/auth/logout")).status).toBe(204);
    expect((await agent.get("/auth/me")).status).toBe(401);
    expect((await pool.query("SELECT count(*)::int AS n FROM sessions")).rows[0].n).toBe(0);
  });

  it("ignores expired sessions", async () => {
    const agent = request.agent(testApp());
    await agent.post("/auth/signup").send(creds);
    await pool.query("UPDATE sessions SET expires_at = now() - interval '1 second'");
    expect((await agent.get("/auth/me")).status).toBe(401);
  });

  it("rejects form-encoded state-changing requests (CSRF defense)", async () => {
    const res = await request(testApp()).post("/auth/login").type("form").send(creds);
    expect(res.status).toBe(415);
  });
});
