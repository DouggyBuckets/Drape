import express from "express";
import { loadUser, rejectFormPosts } from "./auth/middleware.js";
import type { Queryable } from "./db/pool.js";
import { errorHandler } from "./errors.js";
import type { Extractor } from "./extraction/extract.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { itemsRouter } from "./routes/items.js";
import { outfitsRouter, type RunAgent } from "./routes/outfits.js";

export interface AppDeps {
  db: Queryable;
  extractor: Extractor;
  runAgent: RunAgent;
  /** Secure (HTTPS-only) session cookies; true in production. */
  secureCookies: boolean;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.use(express.json());
  app.use(rejectFormPosts);
  app.use(healthRouter(deps.db));
  app.use(loadUser(deps.db));
  app.use(authRouter(deps));
  app.use(itemsRouter(deps));
  app.use(outfitsRouter(deps));
  app.use(errorHandler);
  return app;
}
