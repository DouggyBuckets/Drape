import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { createUser } from "../auth/users.js";
import type { Queryable } from "../db/pool.js";
import { ItemAttributesSchema } from "../extraction/schema.js";
import { insertItem } from "./repository.js";

/** Marks seeded rows so they can be removed without touching real items. */
export const FIXTURE_MODEL = "fixture";

/** Default owner of fixture items in dev and eval databases. Has a random, unknown password. */
export const FIXTURE_USER_EMAIL = "fixtures@drape.local";

const FIXTURE_FILE = new URL("../../eval/fixtures/wardrobe.json", import.meta.url);

export function loadFixtureWardrobe() {
  return z.array(ItemAttributesSchema).parse(JSON.parse(readFileSync(FIXTURE_FILE, "utf8")));
}

/** Returns the id of the user with this email, creating it (random password) if needed. */
export async function ensureUser(db: Queryable, email = FIXTURE_USER_EMAIL): Promise<string> {
  const { rows } = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  if (rows[0]) return rows[0].id;
  return (await createUser(db, email, randomBytes(24).toString("base64url"))).id;
}

export async function removeFixtures(db: Queryable, userId: string): Promise<number> {
  const { rowCount } = await db.query(
    "DELETE FROM wardrobe_items WHERE user_id = $1 AND extraction_model = $2",
    [userId, FIXTURE_MODEL],
  );
  return rowCount ?? 0;
}

/** Replaces the user's previously seeded fixtures with the current fixture file. */
export async function seedFixtures(db: Queryable, userId: string): Promise<number> {
  await removeFixtures(db, userId);
  const items = loadFixtureWardrobe();
  for (const attributes of items) {
    await insertItem(db, userId, {
      id: randomUUID(),
      attributes,
      image: null,
      model: FIXTURE_MODEL,
      extraction: { fixture: true },
    });
  }
  return items.length;
}
