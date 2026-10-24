import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { testApp } from "../../test/helpers.js";
import { pool } from "../db/pool.js";

afterAll(() => pool.end());

const webDist = mkdtempSync(path.join(tmpdir(), "drape-web-"));
writeFileSync(path.join(webDist, "index.html"), "<!doctype html><div id=root></div>");
writeFileSync(path.join(webDist, "app.js"), "console.log('hi')");

describe("serving the frontend", () => {
  const app = testApp({ webDist });

  it("serves static assets and the app for client-side routes", async () => {
    expect((await request(app).get("/app.js")).text).toContain("hi");
    for (const route of ["/", "/wardrobe", "/login"]) {
      const res = await request(app).get(route).set("accept", "text/html");
      expect(res.status).toBe(200);
      expect(res.text).toContain("id=root");
    }
  });

  it("keeps API routes as JSON, including unknown API paths", async () => {
    expect((await request(app).get("/items").set("accept", "text/html")).status).toBe(401);
    const missing = await request(app).get("/items/nope/extra").set("accept", "text/html");
    expect(missing.headers["content-type"]).not.toContain("text/html");
  });
});
