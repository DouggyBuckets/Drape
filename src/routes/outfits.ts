import Anthropic from "@anthropic-ai/sdk";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import type { AgentRequest, AgentResult, TraceEvent } from "../agent/loop.js";
import { requireUser } from "../auth/middleware.js";
import type { Queryable } from "../db/pool.js";
import { type LimitsConfig, recordCost, reserve } from "../limits/limits.js";
import { estimateCostUsd } from "../llm/pricing.js";

export type RunAgent = (
  req: AgentRequest,
  userId: string,
  opts?: { onEvent?: (e: TraceEvent) => void; signal?: AbortSignal },
) => Promise<AgentResult>;

const Body = z.object({
  request: z.string().trim().min(1).max(500),
  location: z.string().trim().min(1).max(100).optional(),
});

export function outfitsRouter(deps: { db: Queryable; runAgent: RunAgent; limits: LimitsConfig }): Router {
  const router = Router();

  /** Validates the body and reserves quota; responds and returns null if either fails. */
  async function prepare(req: Request, res: Response) {
    const body = Body.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "invalid_request", issues: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
      return null;
    }
    const actor = { userId: req.user!.id, ip: req.ip ?? "0.0.0.0", demo: req.readOnly ?? false };
    const event = await reserve(deps.db, deps.limits, "outfit", actor);
    return { request: body.data, event };
  }

  router.post("/outfits", requireUser, async (req, res) => {
    const prepared = await prepare(req, res);
    if (!prepared) return;
    const result = await deps.runAgent(prepared.request, req.user!.id);
    await recordCost(deps.db, prepared.event, estimateCostUsd(result.usage));
    // 422: the request was fine, but the agent couldn't produce an outfit (cap hit, refusal, truncation).
    res.status(result.status === "ok" ? 200 : 422).json(result);
  });

  /**
   * Same as POST /outfits, but streams each agent step as a server-sent event, then the result:
   *   event: step    data: TraceEvent
   *   event: result  data: AgentResult
   *   event: error   data: { error, message }
   * If the client disconnects, the agent is cancelled so no more tokens are spent.
   */
  router.post("/outfits/stream", requireUser, async (req, res) => {
    // Quota and validation errors still get normal JSON responses: nothing is streamed yet.
    const prepared = await prepare(req, res);
    if (!prepared) return;

    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no", // tell reverse proxies not to buffer the stream
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const result = await deps.runAgent(prepared.request, req.user!.id, {
        signal: controller.signal,
        onEvent: (e) => send("step", e),
      });
      await recordCost(deps.db, prepared.event, estimateCostUsd(result.usage));
      if (!controller.signal.aborted) send("result", result);
    } catch (err) {
      console.error(err);
      const upstream = err instanceof Anthropic.APIError;
      send("error", {
        error: upstream ? "upstream_error" : "internal_error",
        message: upstream ? "The model request failed. Please try again." : "Something went wrong.",
      });
    } finally {
      res.end();
    }
  });

  return router;
}
