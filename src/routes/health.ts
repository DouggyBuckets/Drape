import { Router } from "express";
import type { Queryable } from "../db/pool.js";

export function healthRouter(db: Queryable): Router {
  const router = Router();

  // Liveness: is the process up? No database query, so frequent platform health checks don't
  // keep a scale-to-zero database (e.g. Neon) awake around the clock.
  router.get("/livez", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Readiness: can we reach Postgres? Use for manual checks and monitoring, not frequent polling.
  router.get("/health", async (_req, res) => {
    try {
      await db.query("SELECT 1");
      res.json({ status: "ok", db: "ok" });
    } catch {
      res.status(503).json({ status: "degraded", db: "unreachable" });
    }
  });

  return router;
}
