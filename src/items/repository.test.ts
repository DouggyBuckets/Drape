import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import { ensureUser, seedFixtures } from "./fixtures.js";
import { getItemsByIds, searchItems } from "./repository.js";

let userId: string;
let otherUserId: string;

beforeAll(async () => {
  await pool.query("TRUNCATE users, wardrobe_items CASCADE");
  userId = await ensureUser(pool, "owner@example.com");
  otherUserId = await ensureUser(pool, "other@example.com");
  await seedFixtures(pool, userId);
  await seedFixtures(pool, otherUserId);
});
afterAll(() => pool.end());

describe("searchItems", () => {
  it("filters by category, formality range and season", async () => {
    const shoes = await searchItems(pool, userId, { category: "shoes", formalityMin: 3, season: "winter" });
    expect(shoes.map((s) => s.name).sort()).toEqual(["black leather oxford dress shoes", "brown leather lace-up boots"]);
  });

  it("filters by colors and warmth", async () => {
    const items = await searchItems(pool, userId, { colors: ["navy"], warmthMin: 5 });
    expect(items.map((i) => i.name)).toEqual(["navy wool overcoat"]);
  });

  it("matches name keywords case-insensitively and treats % literally", async () => {
    expect((await searchItems(pool, userId, { nameContains: "WOOL" })).length).toBeGreaterThanOrEqual(3);
    expect(await searchItems(pool, userId, { nameContains: "%" })).toEqual([]);
  });

  it("caps results at the limit", async () => {
    expect(await searchItems(pool, userId, { limit: 3 })).toHaveLength(3);
  });
});

describe("user scoping", () => {
  it("only searches the given user's wardrobe", async () => {
    const mine = await searchItems(pool, userId, { limit: 50 });
    const theirs = await searchItems(pool, otherUserId, { limit: 50 });
    expect(mine).toHaveLength(33);
    expect(mine.some((i) => theirs.some((t) => t.id === i.id))).toBe(false);
  });

  it("treats another user's ids as missing", async () => {
    const [theirs] = await searchItems(pool, otherUserId, { limit: 1 });
    expect(await getItemsByIds(pool, userId, [theirs!.id])).toEqual([]);
  });
});

describe("getItemsByIds", () => {
  it("returns only ids that exist, ignoring malformed ones", async () => {
    const [one] = await searchItems(pool, userId, { limit: 1 });
    const found = await getItemsByIds(pool, userId, [one!.id, "00000000-0000-4000-8000-000000000000", "not-a-uuid"]);
    expect(found.map((i) => i.id)).toEqual([one!.id]);
  });
});
