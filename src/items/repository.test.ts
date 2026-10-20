import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import { seedFixtures } from "./fixtures.js";
import { getItemsByIds, searchItems } from "./repository.js";

beforeAll(async () => {
  await pool.query("TRUNCATE wardrobe_items");
  await seedFixtures(pool);
});
afterAll(() => pool.end());

describe("searchItems", () => {
  it("filters by category, formality range and season", async () => {
    const shoes = await searchItems(pool, { category: "shoes", formalityMin: 3, season: "winter" });
    expect(shoes.map((s) => s.name).sort()).toEqual(["black leather oxford dress shoes", "brown leather lace-up boots"]);
  });

  it("filters by colors and warmth", async () => {
    const items = await searchItems(pool, { colors: ["navy"], warmthMin: 5 });
    expect(items.map((i) => i.name)).toEqual(["navy wool overcoat"]);
  });

  it("matches name keywords case-insensitively and treats % literally", async () => {
    expect((await searchItems(pool, { nameContains: "WOOL" })).length).toBeGreaterThanOrEqual(3);
    expect(await searchItems(pool, { nameContains: "%" })).toEqual([]);
  });

  it("caps results at the limit", async () => {
    expect(await searchItems(pool, { limit: 3 })).toHaveLength(3);
  });
});

describe("getItemsByIds", () => {
  it("returns only ids that exist, ignoring malformed ones", async () => {
    const [one] = await searchItems(pool, { limit: 1 });
    const found = await getItemsByIds(pool, [one!.id, "00000000-0000-4000-8000-000000000000", "not-a-uuid"]);
    expect(found.map((i) => i.id)).toEqual([one!.id]);
  });
});
