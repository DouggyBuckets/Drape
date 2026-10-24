import path from "node:path";
import express from "express";
import { loadUser, rejectFormPosts } from "./auth/middleware.js";
import type { Queryable } from "./db/pool.js";
import { errorHandler } from "./errors.js";
import type { Extractor } from "./extraction/extract.js";
import type { LimitsConfig } from "./limits/limits.js";
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
  limits: LimitsConfig;
  /** Reverse-proxy hops to trust for req.ip (0 locally). */
  trustProxy?: number;
  /** Built frontend (web/dist) to serve; omitted in tests and when the UI runs on Vite. */
  webDist?: string;
}

const API_PREFIXES = ["/auth", "/items", "/outfits", "/health"];

export function createApp(deps: AppDeps) {
  const app = express();
  app.set("trust proxy", deps.trustProxy ?? 0);
  app.use(express.json());
  app.use(rejectFormPosts);
  app.use(healthRouter(deps.db));
  app.use(loadUser(deps.db));
  app.use(authRouter(deps));
  app.use(itemsRouter(deps));
  app.use(outfitsRouter(deps));

  if (deps.webDist) {
    const webDist = deps.webDist;
    app.use(express.static(webDist, { index: false }));
    // Client-side routes (/wardrobe, /login, ...) all load the single-page app.
    app.use((req, res, next) => {
      const isApi = API_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`));
      if (req.method !== "GET" || isApi || !req.accepts("html")) return next();
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
