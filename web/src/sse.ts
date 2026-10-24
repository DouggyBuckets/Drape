import { type AgentResult, ApiError, type TraceEvent } from "./api";

export interface SSEEvent {
  event: string;
  data: string;
}

/** Splits complete `event:/data:` frames off a buffer; returns the incomplete tail as `rest`. */
export function parseSSE(buffer: string): { events: SSEEvent[]; rest: string } {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const events = frames.filter(Boolean).map((frame) => {
    let event = "message";
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data.push(line.slice(6));
    }
    return { event, data: data.join("\n") };
  });
  return { events, rest };
}

/**
 * POSTs to /outfits/stream and calls onStep for each agent step as it arrives.
 * (EventSource only supports GET, so this reads the response body stream directly.)
 */
export async function streamOutfit(
  body: { request: string; location?: string },
  { onStep, signal }: { onStep: (e: TraceEvent) => void; signal: AbortSignal },
): Promise<AgentResult> {
  const res = await fetch("/outfits/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.error ?? "error", err.message ?? `Something went wrong (${res.status}).`);
  }

  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const parsed = parseSSE(buffer + value);
    buffer = parsed.rest;
    for (const { event, data } of parsed.events) {
      if (event === "step") onStep(JSON.parse(data));
      else if (event === "result") return JSON.parse(data);
      else if (event === "error") {
        const e = JSON.parse(data);
        throw new ApiError(500, e.error, e.message);
      }
    }
  }
  throw new ApiError(500, "stream_ended", "The connection closed before the outfit was ready. Please try again.");
}
