import express from "express";
import type { Queryable } from "./db/pool.js";
import { errorHandler } from "./errors.js";
import type { Extractor } from "./extraction/extract.js";
import { healthRouter } from "./routes/health.js";
import { itemsRouter } from "./routes/items.js";
import { outfitsRouter, type RunAgent } from "./routes/outfits.js";

export interface AppDeps {
  db: Queryable;
  extractor: Extractor;
  runAgent: RunAgent;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.use(express.json());
  app.use(healthRouter(deps.db));
  app.use(itemsRouter(deps));
  app.use(outfitsRouter(deps));
  app.use(errorHandler);
  return app;
}
