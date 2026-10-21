import { createHash, randomBytes } from "node:crypto";
import type { Queryable } from "../db/pool.js";
import type { User } from "./users.js";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest();

/** Creates a session and returns the raw token (only ever sent to the client, never stored). */
export async function createSession(db: Queryable, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    hashToken(token), userId, new Date(Date.now() + SESSION_TTL_MS),
  ]);
  // Opportunistic cleanup keeps the table small without a cron job.
  await db.query("DELETE FROM sessions WHERE user_id = $1 AND expires_at < now()", [userId]);
  return token;
}

export async function getSessionUser(db: Queryable, token: string): Promise<User | null> {
  const { rows } = await db.query<{ id: string; email: string; is_demo: boolean }>(
    `SELECT u.id, u.email, u.is_demo FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const r = rows[0];
  return r ? { id: r.id, email: r.email, isDemo: r.is_demo } : null;
}

export async function deleteSession(db: Queryable, token: string): Promise<void> {
  await db.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}
