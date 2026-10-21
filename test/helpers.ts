import sharp from "sharp";
import { type AppDeps, createApp } from "../src/app.js";
import { pool } from "../src/db/pool.js";
import type { ExtractionResult } from "../src/extraction/extract.js";

export const sampleResult = (): ExtractionResult => ({
  attributes: {
    name: "navy wool overcoat",
    category: "outerwear",
    color: "navy",
    formality: 4,
    warmth: 5,
    seasons: ["fall", "winter"],
  },
  image: Buffer.from("fake-jpeg"),
  model: "claude-opus-5-5",
  usage: { inputTokens: 3000, outputTokens: 80 },
});

export function testApp(overrides: Partial<AppDeps> = {}) {
  return createApp({
    db: pool,
    extractor: async () => sampleResult(),
    secureCookies: false,
    runAgent: async () => {
      throw new Error("runAgent not stubbed for this test");
    },
    ...overrides,
  });
}

/** A small real PNG, for exercising image preprocessing. */
export function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#1f2a44" } }).png().toBuffer();
}
