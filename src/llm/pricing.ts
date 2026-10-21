// List prices for claude-opus-5-5, USD per million tokens. Estimates only; check current pricing.
// Cache writes (5-minute TTL) bill at 1.25x input; cache reads at $0.20.
export const PRICE_PER_MTOK = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };

export function estimateCostUsd(u: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): number {
  return (
    (u.inputTokens * PRICE_PER_MTOK.input +
      u.outputTokens * PRICE_PER_MTOK.output +
      (u.cacheWriteTokens ?? 0) * PRICE_PER_MTOK.cacheWrite +
      (u.cacheReadTokens ?? 0) * PRICE_PER_MTOK.cacheRead) /
    1e6
  );
}
