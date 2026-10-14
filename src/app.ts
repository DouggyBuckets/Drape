import express from "express";
import type { Queryable } from "./db/pool.js";
import { healthRouter } from "./routes/health.js";

export function createApp(deps: { db: Queryable }) {
  const app = express();
  app.use(express.json());
  app.use(healthRouter(deps.db));
  return app;
}
