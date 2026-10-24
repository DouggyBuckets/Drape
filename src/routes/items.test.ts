import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { makePng, sampleResult, signedIn, testApp } from "../../test/helpers.js";
import { type Queryable, pool } from "../db/pool.js";
import { ExtractionError } from "../extraction/errors.js";
import { seedFixtures } from "../items/fixtures.js";

beforeEach(() => pool.query("TRUNCATE users, wardrobe_items CASCADE"));
afterAll(() => pool.end());

const count = async () => (await pool.query("SELECT count(*)::int AS n FROM wardrobe_items")).rows[0].n;
const upload = async (agent: request.Agent) =>
  agent.post("/items").attach("image", await makePng(10, 10), "x.png");

describe("POST /items", () => {
  it("extracts, stores the row with its image under the user, and returns the item", async () => {
    const { agent, user } = await signedIn();
    const res = await upload(agent);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ...sampleResult().attributes,
      id: expect.any(String),
      imageUrl: `/items/${res.body.id}/image`,
    });

    const { rows } = await pool.query("SELECT user_id, extraction_model, extraction, image FROM wardrobe_items");
    expect(rows).toEqual([{
      user_id: user.id,
      extraction_model: "claude-opus-5-5",
      extraction: expect.objectContaining({ usage: expect.any(Object) }),
      image: sampleResult().image,
    }]);
  });

  it("requires a session", async () => {
    const res = await request(testApp()).post("/items").attach("image", await makePng(10, 10), "x.png");
    expect(res.status).toBe(401);
    expect(await count()).toBe(0);
  });

  it("returns 400 when no image is attached", async () => {
    const { agent } = await signedIn();
    const res = await agent.post("/items");
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
    const { agent } = await signedIn(app);
    const res = await upload(agent);
    expect(res.status).toBe(status);
    expect(res.body.error).toBe(code);
    expect(await count()).toBe(0);
  });

  it("returns 500 if the database insert fails", async () => {
    // Sessions still resolve against the real pool; only the item insert fails.
    const failingDb: Queryable = {
      query: ((sql: string, params?: unknown[]) =>
        /INSERT INTO wardrobe_items/.test(sql) ? Promise.reject(new Error("insert failed")) : pool.query(sql, params)) as Queryable["query"],
    };
    const { agent } = await signedIn(testApp({ db: failingDb }));
    expect((await upload(agent)).status).toBe(500);
  });
});

describe("GET /items", () => {
  it("lists stored items and fetches one by id", async () => {
    const { agent } = await signedIn();
    const created = await upload(agent);

    const list = await agent.get("/items");
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).not.toHaveProperty("image");

    const one = await agent.get(`/items/${created.body.id}`);
    expect(one.status).toBe(200);
    expect(one.body.name).toBe("navy wool overcoat");
  });

  it("returns 404 for unknown or malformed ids", async () => {
    const { agent } = await signedIn();
    expect((await agent.get("/items/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await agent.get("/items/not-a-uuid")).status).toBe(404);
  });
});

describe("GET /items/:id/image", () => {
  it("serves the stored JPEG with private, long-lived cache headers", async () => {
    const { agent } = await signedIn();
    const created = await upload(agent);
    const res = await agent.get(created.body.imageUrl).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
    expect(Buffer.from(res.body)).toEqual(sampleResult().image);
  });

  it("returns 404 for items without a photo and for unknown ids", async () => {
    const { agent, user } = await signedIn();
    await seedFixtures(pool, user.id);
    const [fixture] = (await agent.get("/items")).body;
    expect(fixture.imageUrl).toBeNull();
    expect((await agent.get(`/items/${fixture.id}/image`)).status).toBe(404);
    expect((await agent.get("/items/not-a-uuid/image")).status).toBe(404);
  });
});

describe("DELETE /items/:id", () => {
  it("deletes the user's own item", async () => {
    const { agent } = await signedIn();
    const item = (await upload(agent)).body;
    expect((await agent.delete(`/items/${item.id}`)).status).toBe(204);
    expect((await agent.get(`/items/${item.id}`)).status).toBe(404);
    expect((await agent.delete(`/items/${item.id}`)).status).toBe(404);
  });
});

describe("wardrobe isolation", () => {
  it("never shows one user's items to another, and answers 404 rather than 403", async () => {
    const app = testApp();
    const alice = await signedIn(app);
    const bob = await signedIn(app);
    const item = (await upload(alice.agent)).body;

    expect((await bob.agent.get("/items")).body).toEqual([]);
    expect((await bob.agent.get(`/items/${item.id}`)).status).toBe(404);
    expect((await bob.agent.get(`/items/${item.id}/image`)).status).toBe(404);
    expect((await bob.agent.delete(`/items/${item.id}`)).status).toBe(404);
    expect((await alice.agent.get(`/items/${item.id}/image`)).status).toBe(200);
  });
});
