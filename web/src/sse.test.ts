import { describe, expect, it } from "vitest";
import { parseSSE } from "./sse";

describe("parseSSE", () => {
  it("parses complete frames and keeps the partial tail", () => {
    const { events, rest } = parseSSE('event: step\ndata: {"a":1}\n\nevent: result\ndata: {"b"');
    expect(events).toEqual([{ event: "step", data: '{"a":1}' }]);
    expect(rest).toBe('event: result\ndata: {"b"');
  });

  it("handles a frame split across chunks", () => {
    const first = parseSSE("event: step\nda");
    const second = parseSSE(first.rest + 'ta: {"x":2}\n\n');
    expect(first.events).toEqual([]);
    expect(second).toEqual({ events: [{ event: "step", data: '{"x":2}' }], rest: "" });
  });

  it("defaults the event name and joins multi-line data", () => {
    expect(parseSSE("data: a\ndata: b\n\n").events).toEqual([{ event: "message", data: "a\nb" }]);
  });
});
