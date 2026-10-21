import type { Queryable } from "../db/pool.js";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password.js";

export interface User {
  id: string;
  email: string;
  isDemo: boolean;
}

interface Row {
  id: string;
  email: string;
  is_demo: boolean;
}
const toUser = (r: Row): User => ({ id: r.id, email: r.email, isDemo: r.is_demo });

export class EmailTakenError extends Error {}

export async function createUser(db: Queryable, email: string, password: string, opts: { isDemo?: boolean } = {}): Promise<User> {
  try {
    const { rows } = await db.query<Row>(
      "INSERT INTO users (email, password_hash, is_demo) VALUES ($1, $2, $3) RETURNING id, email, is_demo",
      [email, await hashPassword(password), opts.isDemo ?? false],
    );
    return toUser(rows[0]!);
  } catch (err) {
    if ((err as { code?: string }).code === "23505" && /email/.test((err as { constraint?: string }).constraint ?? "")) {
      throw new EmailTakenError(email);
    }
    throw err;
  }
}

/**
 * Returns the user only if the password matches. Unknown emails still run a full hash
 * comparison, so response time doesn't reveal which emails have accounts.
 */
export async function authenticate(db: Queryable, email: string, password: string): Promise<User | null> {
  const { rows } = await db.query<Row & { password_hash: string }>(
    "SELECT id, email, is_demo, password_hash FROM users WHERE email = $1",
    [email],
  );
  const row = rows[0];
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  return row && ok ? toUser(row) : null;
}

export async function getDemoUser(db: Queryable): Promise<User | null> {
  const { rows } = await db.query<Row>("SELECT id, email, is_demo FROM users WHERE is_demo");
  return rows[0] ? toUser(rows[0]) : null;
}
