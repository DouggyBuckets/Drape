import type { Queryable } from "../db/pool.js";
import type { ItemAttributes } from "../extraction/schema.js";

export interface WardrobeItem extends ItemAttributes {
  id: string;
  imagePath: string;
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
  image_path: string;
  created_at: Date;
}

const COLUMNS = "id, name, category, color, formality, warmth, seasons, image_path, created_at";

function toItem(r: Row): WardrobeItem {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    color: r.color,
    formality: r.formality,
    warmth: r.warmth,
    seasons: r.seasons,
    imagePath: r.image_path,
    createdAt: r.created_at,
  };
}

export async function insertItem(
  db: Queryable,
  input: {
    id: string;
    attributes: ItemAttributes;
    imagePath: string;
    model: string;
    extraction: unknown;
  },
): Promise<WardrobeItem> {
  const a = input.attributes;
  const { rows } = await db.query<Row>(
    `INSERT INTO wardrobe_items
       (id, name, category, color, formality, warmth, seasons, image_path, extraction_model, extraction)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${COLUMNS}`,
    [input.id, a.name, a.category, a.color, a.formality, a.warmth, a.seasons,
     input.imagePath, input.model, JSON.stringify(input.extraction)],
  );
  return toItem(rows[0]!);
}

export async function listItems(db: Queryable): Promise<WardrobeItem[]> {
  const { rows } = await db.query<Row>(`SELECT ${COLUMNS} FROM wardrobe_items ORDER BY created_at DESC`);
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
export async function searchItems(db: Queryable, f: ItemFilters): Promise<WardrobeItem[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const bind = (v: unknown) => `$${params.push(v)}`;

  if (f.category) where.push(`category = ${bind(f.category)}`);
  if (f.colors?.length) where.push(`color = ANY(${bind(f.colors)})`);
  if (f.formalityMin !== undefined) where.push(`formality >= ${bind(f.formalityMin)}`);
  if (f.formalityMax !== undefined) where.push(`formality <= ${bind(f.formalityMax)}`);
  if (f.warmthMin !== undefined) where.push(`warmth >= ${bind(f.warmthMin)}`);
  if (f.warmthMax !== undefined) where.push(`warmth <= ${bind(f.warmthMax)}`);
  if (f.season) where.push(`${bind(f.season)} = ANY(seasons)`);
  if (f.nameContains) where.push(`name ILIKE ${bind(`%${f.nameContains.replace(/[\\%_]/g, "\\$&")}%`)}`);

  const sql = `SELECT ${COLUMNS} FROM wardrobe_items
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY category, formality, name
    LIMIT ${bind(Math.min(f.limit ?? 25, 50))}`;
  const { rows } = await db.query<Row>(sql, params);
  return rows.map(toItem);
}

/** Looks up several items at once; missing ids are simply absent from the result. */
export async function getItemsByIds(db: Queryable, ids: string[]): Promise<WardrobeItem[]> {
  const valid = ids.filter((id) => UUID.test(id));
  if (!valid.length) return [];
  const { rows } = await db.query<Row>(`SELECT ${COLUMNS} FROM wardrobe_items WHERE id = ANY($1::uuid[])`, [valid]);
  return rows.map(toItem);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getItem(db: Queryable, id: string): Promise<WardrobeItem | null> {
  const { rows } = await db.query<Row>(`SELECT ${COLUMNS} FROM wardrobe_items WHERE id = $1`, [id]);
  return rows[0] ? toItem(rows[0]) : null;
}
