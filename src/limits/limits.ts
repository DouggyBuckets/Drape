// Cost and abuse limits, counted from usage_events over a rolling 24 hours (survives restarts,
// works across instances). Checks and inserts aren't atomic, so concurrent requests can
// overshoot a quota by about one request; acceptable for cost control.
import type { Queryable } from "../db/pool.js";

export interface LimitsConfig {
  uploadsPerUserPerDay: number;
  outfitsPerUserPerDay: number;
  /** The demo account is shared, so it's limited per visitor IP plus a total. */
  demoOutfitsPerIpPerDay: number;
  demoOutfitsPerDay: number;
  signupsPerIpPerDay: number;
  /** Stops all model calls once estimated spend in the last 24h reaches this. */
  dailySpendCapUsd: number;
}

export const DEFAULT_LIMITS: LimitsConfig = {
  uploadsPerUserPerDay: 30,
  outfitsPerUserPerDay: 20,
  demoOutfitsPerIpPerDay: 5,
  demoOutfitsPerDay: 100,
  signupsPerIpPerDay: 5,
  dailySpendCapUsd: 5,
};

export type UsageKind = "signup" | "upload" | "outfit";

export class LimitError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const WINDOW = "now() - interval '24 hours'";

async function count(db: Queryable, kind: UsageKind, where: string, params: unknown[]): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM usage_events WHERE kind = $1 AND created_at > ${WINDOW} AND ${where}`,
    [kind, ...params],
  );
  return rows[0]!.n;
}

async function spendLast24h(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ usd: string }>(
    `SELECT coalesce(sum(cost_usd), 0) AS usd FROM usage_events WHERE created_at > ${WINDOW}`,
  );
  return Number(rows[0]!.usd);
}

export interface Actor {
  userId?: string;
  ip: string;
  /** Read-only demo session on the shared demo account. */
  demo: boolean;
}

/**
 * Throws LimitError if the action is over a limit; otherwise records it and returns the
 * event id, so the caller can attach the actual cost once the model call finishes.
 */
export async function reserve(db: Queryable, limits: LimitsConfig, kind: UsageKind, actor: Actor): Promise<number> {
  if (kind === "signup") {
    if ((await count(db, "signup", "ip = $2", [actor.ip])) >= limits.signupsPerIpPerDay) {
      throw new LimitError("signup_limit", "Too many sign-ups from this network today. Try again tomorrow.");
    }
  } else {
    if ((await spendLast24h(db)) >= limits.dailySpendCapUsd) {
      throw new LimitError("daily_budget_reached", "Drape has reached its daily budget. Please try again tomorrow.");
    }
    if (actor.demo) {
      if ((await count(db, kind, "ip = $2 AND user_id = $3", [actor.ip, actor.userId])) >= limits.demoOutfitsPerIpPerDay) {
        throw new LimitError("demo_limit", "You've used today's demo requests. Sign up to build outfits from your own wardrobe.");
      }
      if ((await count(db, kind, "user_id = $2", [actor.userId])) >= limits.demoOutfitsPerDay) {
        throw new LimitError("demo_limit", "The demo is busy today. Please try again tomorrow.");
      }
    } else {
      const max = kind === "upload" ? limits.uploadsPerUserPerDay : limits.outfitsPerUserPerDay;
      if ((await count(db, kind, "user_id = $2", [actor.userId])) >= max) {
        throw new LimitError(`${kind}_limit`, `Daily limit of ${max} ${kind}s reached. Try again tomorrow.`);
      }
    }
  }

  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO usage_events (user_id, ip, kind) VALUES ($1, $2, $3) RETURNING id",
    [actor.userId ?? null, actor.ip, kind],
  );
  return Number(rows[0]!.id);
}

export async function recordCost(db: Queryable, eventId: number, costUsd: number): Promise<void> {
  await db.query("UPDATE usage_events SET cost_usd = $1 WHERE id = $2", [costUsd.toFixed(4), eventId]);
}
