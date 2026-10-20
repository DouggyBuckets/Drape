import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Queryable } from "../db/pool.js";
import { ItemAttributesSchema } from "../extraction/schema.js";
import { insertItem } from "./repository.js";

/** Marks seeded rows so they can be removed without touching real items. */
export const FIXTURE_MODEL = "fixture";

const FIXTURE_FILE = new URL("../../eval/fixtures/wardrobe.json", import.meta.url);

export function loadFixtureWardrobe() {
  return z.array(ItemAttributesSchema).parse(JSON.parse(readFileSync(FIXTURE_FILE, "utf8")));
}

export async function removeFixtures(db: Queryable): Promise<number> {
  const { rowCount } = await db.query("DELETE FROM wardrobe_items WHERE extraction_model = $1", [FIXTURE_MODEL]);
  return rowCount ?? 0;
}

/** Replaces any previously seeded fixtures with the current fixture file. */
export async function seedFixtures(db: Queryable): Promise<number> {
  await removeFixtures(db);
  const items = loadFixtureWardrobe();
  for (const attributes of items) {
    await insertItem(db, {
      id: randomUUID(),
      attributes,
      imagePath: "fixture:no-image",
      model: FIXTURE_MODEL,
      extraction: { fixture: true },
    });
  }
  return items.length;
}
