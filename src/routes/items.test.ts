import { readdirSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { makePng, sampleResult, testApp } from "../../test/helpers.js";
import { type Queryable, pool } from "../db/pool.js";
import { ExtractionError } from "../extraction/errors.js";

beforeEach(() => pool.query("TRUNCATE wardrobe_items"));
afterAll(() => pool.end());

describe("POST /items", () => {
  it("extracts, stores the image and row, and returns the item", async () => {
    const uploadDir = mkdtempSync(path.join(tmpdir(), "drape-test-"));
    const res = await request(testApp({ uploadDir }))
      .post("/items")
      .attach("image", await makePng(40, 40), "coat.png");

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...sampleResult().attributes, id: expect.any(String) });
    expect(readdirSync(uploadDir)).toEqual([`${res.body.id}.jpg`]);

    const { rows } = await pool.query("SELECT extraction_model, extraction FROM wardrobe_items");
    expect(rows).toEqual([
      { extraction_model: "claude-opus-5-5", extraction: expect.objectContaining({ usage: expect.any(Object) }) },
    ]);
  });

  it("returns 400 when no image is attached", async () => {
    const res = await request(testApp()).post("/items");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("missing_image");
  });

  it.each([
    ["unsupported_image", 415],
    ["refused", 422],
    ["invalid_output", 502],
  ] as const)("maps ExtractionError %s to %i and stores nothing", async (code, status) => {
    const app = testApp({
      extractor: async () => {
        throw new ExtractionError(code, "nope");
      },
    });
    const res = await request(app).post("/items").attach("image", await makePng(10, 10), "x.png");
    expect(res.status).toBe(status);
    expect(res.body.error).toBe(code);
    expect((await pool.query("SELECT count(*)::int AS n FROM wardrobe_items")).rows[0].n).toBe(0);
  });

  it("removes the saved image if the database insert fails", async () => {
    const uploadDir = mkdtempSync(path.join(tmpdir(), "drape-test-"));
    const failingDb = { query: () => Promise.reject(new Error("insert failed")) } as unknown as Queryable;
    const res = await request(testApp({ db: failingDb, uploadDir }))
      .post("/items")
      .attach("image", await makePng(10, 10), "x.png");
    expect(res.status).toBe(500);
    expect(readdirSync(uploadDir)).toEqual([]);
  });
});

describe("GET /items", () => {
  it("lists stored items and fetches one by id", async () => {
    const app = testApp();
    const created = await request(app).post("/items").attach("image", await makePng(10, 10), "x.png");

    const list = await request(app).get("/items");
    expect(list.body).toHaveLength(1);

    const one = await request(app).get(`/items/${created.body.id}`);
    expect(one.status).toBe(200);
    expect(one.body.name).toBe("navy wool overcoat");
  });

  it("returns 404 for unknown or malformed ids", async () => {
    const app = testApp();
    expect((await request(app).get("/items/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await request(app).get("/items/not-a-uuid")).status).toBe(404);
  });
});
