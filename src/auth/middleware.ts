import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from "express";
import type { Queryable } from "../db/pool.js";
import { getSessionUser, SESSION_TTL_MS } from "./sessions.js";
import type { User } from "./users.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      sessionToken?: string;
    }
  }
}

export const SESSION_COOKIE = "drape_session";

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true, // not readable from JavaScript, so XSS can't steal it
    sameSite: "lax", // not sent on cross-site POSTs (CSRF defense)
    secure, // HTTPS only in production
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.cookie?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Attaches req.user when the request carries a valid session cookie. */
export function loadUser(db: Queryable): RequestHandler {
  return async (req, _res, next) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
      const user = await getSessionUser(db, token);
      if (user) {
        req.user = user;
        req.sessionToken = token;
      }
    }
    next();
  };
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  next();
}

// Content types a cross-site HTML form can send without a CORS preflight.
const FORM_TYPES = ["application/x-www-form-urlencoded", "text/plain"];

/**
 * Second CSRF layer beside SameSite: state-changing requests must not use form-style bodies.
 * Our client always sends JSON or multipart uploads (multipart is checked by SameSite alone).
 */
export function rejectFormPosts(req: Request, res: Response, next: NextFunction): void {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && FORM_TYPES.some((t) => req.is(t))) {
    res.status(415).json({ error: "unsupported_content_type", message: "Send JSON." });
    return;
  }
  next();
}
