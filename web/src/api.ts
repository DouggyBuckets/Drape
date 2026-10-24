// Typed client for the Drape API. Types mirror the server's JSON responses (hand-written:
// small API, so this is simpler than generating them).

export type Category = "top" | "bottom" | "outerwear" | "shoes" | "dress" | "accessory";

export interface User {
  id: string;
  email: string;
  isDemo: boolean;
  readOnly: boolean;
}

export interface WardrobeItem {
  id: string;
  name: string;
  category: Category;
  color: string;
  formality: number;
  warmth: number;
  seasons: string[];
  imageUrl: string | null;
  createdAt: string;
}

export interface RuleResult {
  rule: string;
  kind: "structure" | "fit";
  passed: boolean;
  detail: string;
}

export type TraceEvent =
  | { iteration: number; type: "text"; text: string }
  | { iteration: number; type: "tool_call"; name: string; input: Record<string, unknown>; output: unknown; isError: boolean }
  | { iteration: number; type: "nudge"; text: string };

export interface AgentResult {
  status: "ok" | "max_iterations" | "refused" | "truncated";
  outfit: {
    items: WardrobeItem[];
    explanation: string;
    temperatureF: number;
    targetFormality: number;
    warnings: RuleResult[];
  } | null;
  iterations: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  trace: TraceEvent[];
}

/** An error response from the API, carrying the server's error code and readable message. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const FALLBACK_MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don't match.",
  email_taken: "An account with that email already exists.",
  unauthenticated: "Please log in.",
  invalid_request: "Please check the form and try again.",
};

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { "content-type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = body.error ?? "error";
    const issues = Array.isArray(body.issues) ? ` (${body.issues.join("; ")})` : "";
    throw new ApiError(res.status, code, (body.message ?? FALLBACK_MESSAGES[code] ?? `Something went wrong (${res.status}).`) + issues);
  }
  return body as T;
}
