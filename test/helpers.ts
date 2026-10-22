import sharp from "sharp";
import request from "supertest";
import { type AppDeps, createApp } from "../src/app.js";
import { pool } from "../src/db/pool.js";
import type { ExtractionResult } from "../src/extraction/extract.js";
import { DEFAULT_LIMITS } from "../src/limits/limits.js";

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
    // Generous so unrelated tests never hit a limit; limit tests override these.
    limits: { ...DEFAULT_LIMITS, signupsPerIpPerDay: 1000, uploadsPerUserPerDay: 1000, outfitsPerUserPerDay: 1000 },
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

let signupCount = 0;

/** A supertest agent holding a session cookie for a freshly signed-up user. */
export async function signedIn(app = testApp(), email = `user${++signupCount}-${Date.now()}@example.com`) {
  const agent = request.agent(app);
  const res = await agent.post("/auth/signup").send({ email, password: "a long enough password" });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body as { id: string; email: string } };
}
