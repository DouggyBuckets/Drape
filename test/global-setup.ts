import pg from "pg";
import { ensureDatabase } from "../src/db/setup.js";
import { TEST_DATABASE_URL } from "../vitest.config.js";

/** Creates the drape_test database if needed and applies all migrations to it. */
export async function setup() {
  await ensureDatabase(TEST_DATABASE_URL);

  // Set before importing: the migrate module loads env config at import time.
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.ANTHROPIC_API_KEY ??= "sk-ant-test-placeholder";
  const { runMigrations } = await import("../src/db/migrate.js");
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  await runMigrations(pool);
  await pool.end();
}
