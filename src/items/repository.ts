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

export async function getItem(db: Queryable, id: string): Promise<WardrobeItem | null> {
  const { rows } = await db.query<Row>(`SELECT ${COLUMNS} FROM wardrobe_items WHERE id = $1`, [id]);
  return rows[0] ? toItem(rows[0]) : null;
}
