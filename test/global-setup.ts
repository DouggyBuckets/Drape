import pg from "pg";
import { resetDatabase } from "../src/db/setup.js";
import { TEST_DATABASE_URL } from "../vitest.config.js";

/** Recreates the drape_test database from scratch and applies all migrations. */
export async function setup() {
  await resetDatabase(TEST_DATABASE_URL);

  // Set before importing: the migrate module loads env config at import time.
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.ANTHROPIC_API_KEY ??= "sk-ant-test-placeholder";
  const { runMigrations } = await import("../src/db/migrate.js");
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  await runMigrations(pool);
  await pool.end();
}
