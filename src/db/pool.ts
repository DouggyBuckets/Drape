import pg from "pg";
import { env } from "../config/env.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  // Fail fast instead of hanging requests when Postgres is down.
  connectionTimeoutMillis: 2_000,
});

// An idle client losing its connection (e.g. Postgres restarts) emits 'error' on the pool.
// Unhandled, that crashes the process; the pool already discards the dead client.
pool.on("error", (err) => {
  console.error("Postgres idle client error:", err.message);
});

/** The slice of pg.Pool that request handlers need; lets tests pass a fake. */
export type Queryable = Pick<pg.Pool, "query">;
