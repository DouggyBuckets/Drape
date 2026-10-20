import { Router } from "express";
import { z } from "zod";
import type { AgentRequest, AgentResult } from "../agent/loop.js";

export type RunAgent = (req: AgentRequest) => Promise<AgentResult>;

const Body = z.object({
  request: z.string().trim().min(1).max(500),
  location: z.string().trim().min(1).max(100).optional(),
});

export function outfitsRouter(deps: { runAgent: RunAgent }): Router {
  const router = Router();

  router.post("/outfits", async (req, res) => {
    const body = Body.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "invalid_request", issues: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
      return;
    }

    const result = await deps.runAgent(body.data);
    // 422: the request was fine, but the agent couldn't produce an outfit (cap hit, refusal, truncation).
    res.status(result.status === "ok" ? 200 : 422).json(result);
  });

  return router;
}
