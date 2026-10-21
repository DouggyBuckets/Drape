// One-off: copies images from image_path files into the image column (migration 003).
import { readFile } from "node:fs/promises";
import { pool } from "../src/db/pool.js";

try {
  const { rows } = await pool.query<{ id: string; image_path: string }>(
    "SELECT id, image_path FROM wardrobe_items WHERE image IS NULL AND image_path NOT LIKE 'fixture:%'",
  );
  let copied = 0;
  for (const row of rows) {
    try {
      await pool.query("UPDATE wardrobe_items SET image = $1 WHERE id = $2", [await readFile(row.image_path), row.id]);
      copied++;
    } catch (err) {
      console.warn(`skipped ${row.id}: ${(err as Error).message}`);
    }
  }
  console.log(`Backfilled ${copied}/${rows.length} images.`);
} finally {
  await pool.end();
}
