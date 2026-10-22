import { Router } from "express";
import { z } from "zod";
import { SESSION_COOKIE, sessionCookieOptions } from "../auth/middleware.js";
import { createSession, deleteSession } from "../auth/sessions.js";
import { authenticate, createUser, EmailTakenError, getDemoUser } from "../auth/users.js";
import type { Queryable } from "../db/pool.js";
import { type LimitsConfig, reserve } from "../limits/limits.js";

const Credentials = z.object({
  email: z.email().max(254).transform((e) => e.trim()),
  password: z.string().min(10, "at least 10 characters").max(200),
});

export function authRouter(deps: { db: Queryable; secureCookies: boolean; limits: LimitsConfig }): Router {
  const router = Router();
  const cookie = sessionCookieOptions(deps.secureCookies);

  router.post("/auth/signup", async (req, res) => {
    const body = Credentials.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "invalid_request", issues: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
      return;
    }
    await reserve(deps.db, deps.limits, "signup", { ip: req.ip ?? "0.0.0.0", demo: false });
    try {
      const user = await createUser(deps.db, body.data.email, body.data.password);
      res.cookie(SESSION_COOKIE, await createSession(deps.db, user.id), cookie).status(201).json(user);
    } catch (err) {
      if (err instanceof EmailTakenError) {
        res.status(409).json({ error: "email_taken" });
        return;
      }
      throw err;
    }
  });

  router.post("/auth/login", async (req, res) => {
    const body = z.object({ email: z.string(), password: z.string() }).safeParse(req.body);
    const user = body.success ? await authenticate(deps.db, body.data.email.trim(), body.data.password) : null;
    if (!user) {
      // Same response whether the email or the password was wrong.
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    res.cookie(SESSION_COOKIE, await createSession(deps.db, user.id), cookie).json(user);
  });

  // "Try the demo": a read-only session on the shared demo account, no password needed.
  router.post("/auth/demo", async (_req, res) => {
    const demo = await getDemoUser(deps.db);
    if (!demo) {
      res.status(404).json({ error: "no_demo", message: "No demo account is configured." });
      return;
    }
    res.cookie(SESSION_COOKIE, await createSession(deps.db, demo.id, { readOnly: true }), cookie).json({ ...demo, readOnly: true });
  });

  router.post("/auth/logout", async (req, res) => {
    if (req.sessionToken) await deleteSession(deps.db, req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { ...cookie, maxAge: undefined }).status(204).end();
  });

  router.get("/auth/me", (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    res.json({ ...req.user, readOnly: req.readOnly ?? false });
  });

  return router;
}
