import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { makePng, sampleResult, testApp } from "../../test/helpers.js";
import { type Queryable, pool } from "../db/pool.js";
import { ExtractionError } from "../extraction/errors.js";
import { seedFixtures } from "../items/fixtures.js";

beforeEach(() => pool.query("TRUNCATE wardrobe_items"));
afterAll(() => pool.end());

const count = async () => (await pool.query("SELECT count(*)::int AS n FROM wardrobe_items")).rows[0].n;

describe("POST /items", () => {
  it("extracts, stores the row with its image, and returns the item", async () => {
    const res = await request(testApp()).post("/items").attach("image", await makePng(40, 40), "coat.png");

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ...sampleResult().attributes,
      id: expect.any(String),
      imageUrl: `/items/${res.body.id}/image`,
    });

    const { rows } = await pool.query("SELECT extraction_model, extraction, image FROM wardrobe_items");
    expect(rows).toEqual([{
      extraction_model: "claude-opus-5-5",
      extraction: expect.objectContaining({ usage: expect.any(Object) }),
      image: sampleResult().image,
    }]);
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
    expect(await count()).toBe(0);
  });

  it("returns 500 if the database insert fails", async () => {
    const failingDb = { query: () => Promise.reject(new Error("insert failed")) } as unknown as Queryable;
    const res = await request(testApp({ db: failingDb })).post("/items").attach("image", await makePng(10, 10), "x.png");
    expect(res.status).toBe(500);
  });
});

describe("GET /items", () => {
  it("lists stored items and fetches one by id", async () => {
    const app = testApp();
    const created = await request(app).post("/items").attach("image", await makePng(10, 10), "x.png");

    const list = await request(app).get("/items");
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).not.toHaveProperty("image");

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

describe("GET /items/:id/image", () => {
  it("serves the stored JPEG with long-lived cache headers", async () => {
    const app = testApp();
    const created = await request(app).post("/items").attach("image", await makePng(10, 10), "x.png");
    const res = await request(app).get(created.body.imageUrl).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toContain("immutable");
    expect(Buffer.from(res.body)).toEqual(sampleResult().image);
  });

  it("returns 404 for items without a photo and for unknown ids", async () => {
    await seedFixtures(pool);
    const [fixture] = (await request(testApp()).get("/items")).body;
    expect(fixture.imageUrl).toBeNull();
    expect((await request(testApp()).get(`/items/${fixture.id}/image`)).status).toBe(404);
    expect((await request(testApp()).get("/items/not-a-uuid/image")).status).toBe(404);
  });
});
