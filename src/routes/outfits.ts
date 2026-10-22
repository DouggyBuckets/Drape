import { Router } from "express";
import { requireUser } from "../auth/middleware.js";
import { z } from "zod";
import type { AgentRequest, AgentResult } from "../agent/loop.js";
import type { Queryable } from "../db/pool.js";
import { type LimitsConfig, recordCost, reserve } from "../limits/limits.js";
import { estimateCostUsd } from "../llm/pricing.js";

export type RunAgent = (req: AgentRequest, userId: string) => Promise<AgentResult>;

const Body = z.object({
  request: z.string().trim().min(1).max(500),
  location: z.string().trim().min(1).max(100).optional(),
});

export function outfitsRouter(deps: { db: Queryable; runAgent: RunAgent; limits: LimitsConfig }): Router {
  const router = Router();

  router.post("/outfits", requireUser, async (req, res) => {
    const body = Body.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "invalid_request", issues: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
      return;
    }

    const actor = { userId: req.user!.id, ip: req.ip ?? "0.0.0.0", demo: req.readOnly ?? false };
    const event = await reserve(deps.db, deps.limits, "outfit", actor);
    const result = await deps.runAgent(body.data, req.user!.id);
    await recordCost(deps.db, event, estimateCostUsd(result.usage));
    // 422: the request was fine, but the agent couldn't produce an outfit (cap hit, refusal, truncation).
    res.status(result.status === "ok" ? 200 : 422).json(result);
  });

  return router;
}
