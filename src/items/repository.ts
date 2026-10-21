// Every function takes a required userId and filters on it: there is deliberately no
// way to query items across users. Another user's item looks exactly like a missing one.
import type { Queryable } from "../db/pool.js";
import type { ItemAttributes } from "../extraction/schema.js";

export interface WardrobeItem extends ItemAttributes {
  id: string;
  /** Relative URL of the item photo, or null for items without one (e.g. fixtures). */
  imageUrl: string | null;
  createdAt: Date;
}

interface Row {
  id: string;
  name: string;
  category: ItemAttributes["category"];
  color: ItemAttributes["color"];
  formality: number;
  warmth: number;
  seasons: ItemAttributes["seasons"];
  has_image: boolean;
  created_at: Date;
}

// Never selects the image bytes themselves; those are served by getItemImage.
const COLUMNS = "id, name, category, color, formality, warmth, seasons, image IS NOT NULL AS has_image, created_at";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toItem(r: Row): WardrobeItem {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    color: r.color,
    formality: r.formality,
    warmth: r.warmth,
    seasons: r.seasons,
    imageUrl: r.has_image ? `/items/${r.id}/image` : null,
    createdAt: r.created_at,
  };
}

export async function insertItem(
  db: Queryable,
  userId: string,
  input: {
    id: string;
    attributes: ItemAttributes;
    image: Buffer | null;
    model: string;
    extraction: unknown;
  },
): Promise<WardrobeItem> {
  const a = input.attributes;
  const { rows } = await db.query<Row>(
    `INSERT INTO wardrobe_items
       (id, user_id, name, category, color, formality, warmth, seasons, image, extraction_model, extraction)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${COLUMNS}`,
    [input.id, userId, a.name, a.category, a.color, a.formality, a.warmth, a.seasons,
     input.image, input.model, JSON.stringify(input.extraction)],
  );
  return toItem(rows[0]!);
}

export async function listItems(db: Queryable, userId: string): Promise<WardrobeItem[]> {
  const { rows } = await db.query<Row>(
    `SELECT ${COLUMNS} FROM wardrobe_items WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map(toItem);
}

export interface ItemFilters {
  category?: ItemAttributes["category"];
  colors?: ItemAttributes["color"][];
  formalityMin?: number;
  formalityMax?: number;
  warmthMin?: number;
  warmthMax?: number;
  season?: ItemAttributes["seasons"][number];
  nameContains?: string;
  limit?: number;
}

/** Filtered wardrobe search. Values are always bound parameters, never interpolated. */
export async function searchItems(db: Queryable, userId: string, f: ItemFilters): Promise<WardrobeItem[]> {
  const params: unknown[] = [];
  const bind = (v: unknown) => `$${params.push(v)}`;
  const where = [`user_id = ${bind(userId)}`];

  if (f.category) where.push(`category = ${bind(f.category)}`);
  if (f.colors?.length) where.push(`color = ANY(${bind(f.colors)})`);
  if (f.formalityMin !== undefined) where.push(`formality >= ${bind(f.formalityMin)}`);
  if (f.formalityMax !== undefined) where.push(`formality <= ${bind(f.formalityMax)}`);
  if (f.warmthMin !== undefined) where.push(`warmth >= ${bind(f.warmthMin)}`);
  if (f.warmthMax !== undefined) where.push(`warmth <= ${bind(f.warmthMax)}`);
  if (f.season) where.push(`${bind(f.season)} = ANY(seasons)`);
  if (f.nameContains) where.push(`name ILIKE ${bind(`%${f.nameContains.replace(/[\\%_]/g, "\\$&")}%`)}`);

  const sql = `SELECT ${COLUMNS} FROM wardrobe_items
    WHERE ${where.join(" AND ")}
    ORDER BY category, formality, name
    LIMIT ${bind(Math.min(f.limit ?? 25, 50))}`;
  const { rows } = await db.query<Row>(sql, params);
  return rows.map(toItem);
}

/** Looks up several of the user's items; missing or other users' ids are simply absent. */
export async function getItemsByIds(db: Queryable, userId: string, ids: string[]): Promise<WardrobeItem[]> {
  const valid = ids.filter((id) => UUID.test(id));
  if (!valid.length) return [];
  const { rows } = await db.query<Row>(
    `SELECT ${COLUMNS} FROM wardrobe_items WHERE user_id = $1 AND id = ANY($2::uuid[])`,
    [userId, valid],
  );
  return rows.map(toItem);
}

export async function getItemImage(db: Queryable, userId: string, id: string): Promise<Buffer | null> {
  if (!UUID.test(id)) return null;
  const { rows } = await db.query<{ image: Buffer | null }>(
    "SELECT image FROM wardrobe_items WHERE user_id = $1 AND id = $2",
    [userId, id],
  );
  return rows[0]?.image ?? null;
}

export async function getItem(db: Queryable, userId: string, id: string): Promise<WardrobeItem | null> {
  if (!UUID.test(id)) return null;
  const { rows } = await db.query<Row>(`SELECT ${COLUMNS} FROM wardrobe_items WHERE user_id = $1 AND id = $2`, [userId, id]);
  return rows[0] ? toItem(rows[0]) : null;
}
