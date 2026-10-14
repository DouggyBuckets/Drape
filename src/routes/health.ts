import { Router } from "express";
import type { Queryable } from "../db/pool.js";

export function healthRouter(db: Queryable): Router {
  const router = Router();

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
