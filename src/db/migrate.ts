import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type pg from "pg";
import { pool } from "./pool.js";

// Resolves to <repo>/migrations from both src/db and dist/db.
const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);
const FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;
// Arbitrary constant: only one migrate process may hold this lock at a time.
const LOCK_ID = 7_243_001;

export async function runMigrations(db: pg.Pool = pool): Promise<string[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const misnamed = files.filter((f) => !FILE_PATTERN.test(f));
  if (misnamed.length > 0) {
    throw new Error(`Migration files must look like 001_name.sql: ${misnamed.join(", ")}`);
  }

  const client = await db.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const done = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(new URL(file, MIGRATIONS_DIR), "utf8");
      // Each migration and its bookkeeping row commit together, or not at all.
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        const hint = (err as { hint?: string }).hint;
        throw new Error(`Migration ${file} failed: ${(err as Error).message}${hint ? `\n  ${hint}` : ""}`, { cause: err });
      }
      applied.push(file);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    client.release();
  }
  return applied;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const applied = await runMigrations();
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "No pending migrations.");
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
