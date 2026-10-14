import pg from "pg";
import { TEST_DATABASE_URL } from "../vitest.config.js";

/** Creates the drape_test database if needed and applies all migrations to it. */
export async function setup() {
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = "/drape";
  const admin = new pg.Client({ connectionString: adminUrl.href });
  await admin.connect();
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'drape_test'");
  if (!rowCount) await admin.query("CREATE DATABASE drape_test");
  await admin.end();

  // Set before importing: the migrate module loads env config at import time.
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.ANTHROPIC_API_KEY ??= "sk-ant-test-placeholder";
  const { runMigrations } = await import("../src/db/migrate.js");
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  await runMigrations(pool);
  await pool.end();
}
