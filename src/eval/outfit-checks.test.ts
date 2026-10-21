import { describe, expect, it } from "vitest";
import type { AgentResult } from "../agent/loop.js";
import type { WardrobeItem } from "../items/repository.js";
import type { OutfitItem } from "../outfit/rules.js";
import { type GradedRun, gradeRun, type OutfitCase, summarize } from "./outfit-checks.js";

const it_ = (id: string, category: OutfitItem["category"], formality: number, warmth: number): OutfitItem =>
  ({ id, name: id, category, formality, warmth });

const wardrobe = [
  it_("sweater", "top", 3, 3), it_("chinos", "bottom", 3, 3), it_("boots", "shoes", 3, 4),
  it_("bomber", "outerwear", 3, 4), it_("tank", "top", 1, 1), it_("parka", "outerwear", 2, 5),
];
const lookup = new Map(wardrobe.map((i) => [i.id, i]));

const dinner: OutfitCase = {
  id: "dinner", request: "dinner, 45 degrees, smart casual", tags: ["stated"],
  expect: { temperatureF: [45, 45], formality: [3, 3], needsWeather: false },
};

function run(ids: string[], o: Partial<{ temperatureF: number; targetFormality: number; weather: boolean; status: AgentResult["status"] }> = {}): AgentResult {
  return {
    status: o.status ?? "ok",
    outfit: o.status && o.status !== "ok" ? null : {
      items: ids.map((id) => ({ id }) as WardrobeItem), // the grader must not trust these attributes
      explanation: "", temperatureF: o.temperatureF ?? 45, targetFormality: o.targetFormality ?? 3, warnings: [],
    },
    iterations: 3, models: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    trace: o.weather ? [{ iteration: 1, type: "tool_call", name: "get_weather", input: {}, output: {}, isError: false }] : [],
  };
}

const byCheck = (rs: ReturnType<typeof gradeRun>) => Object.fromEntries(rs.map((r) => [r.check, r.passed]));

describe("gradeRun", () => {
  it("passes a correct outfit on every check", () => {
    expect(Object.values(byCheck(gradeRun(dinner, run(["sweater", "chinos", "boots", "bomber"]), lookup)))).toEqual(Array(8).fill(true));
  });

  it("grades warmth at the expected temperature, not the agent's claimed one", () => {
    const r = byCheck(gradeRun(dinner, run(["tank", "chinos", "boots"], { temperatureF: 85 }), lookup));
    expect(r).toMatchObject({ warmth_fits: false, understood_temperature: false, formality_fits: false });
  });

  it("flags unknown ids and bad structure using its own lookup", () => {
    const r = byCheck(gradeRun(dinner, run(["sweater", "chinos", "ghost", "bomber", "parka"]), lookup));
    expect(r).toMatchObject({ items_exist: false, one_per_slot: false });
  });

  it("checks weather tool use both ways", () => {
    expect(byCheck(gradeRun(dinner, run(["sweater", "chinos", "boots", "bomber"], { weather: true }), lookup)).weather_tool_use).toBe(false);
    const needs = { ...dinner, expect: { ...dinner.expect, needsWeather: true } };
    expect(byCheck(gradeRun(needs, run(["sweater", "chinos", "boots", "bomber"]), lookup)).weather_tool_use).toBe(false);
  });

  it("grades whether the agent understood the occasion's formality", () => {
    // Items (all formality 3) fit a target of 4 within ±1, but the agent planned for 3.
    const business: OutfitCase = { ...dinner, id: "business", expect: { temperatureF: [45, 45], formality: [4, 4], needsWeather: false } };
    const r = byCheck(gradeRun(business, run(["sweater", "chinos", "boots", "bomber"], { targetFormality: 3 }), lookup));
    expect(r).toMatchObject({ formality_fits: true, understood_formality: false });
  });

  it("fails everything but weather use when no outfit was produced", () => {
    const r = byCheck(gradeRun(dinner, run([], { status: "max_iterations" }), lookup));
    expect(r.completed).toBe(false);
    expect(r.items_exist).toBe(false);
    expect(r.weather_tool_use).toBe(true);
  });
});

describe("summarize", () => {
  const graded = (caseId: string, tags: string[], passed: (boolean | null)[]): GradedRun => ({
    caseId, tags, iterations: 3, latencyMs: 1000, costUsd: 0.05,
    checks: passed.map((p, i) => ({ check: (["completed", "warmth_fits", "formality_fits"] as const)[i]!, passed: p, detail: "" })),
  });

  it("excludes n/a from rates and counts n/a as passing for all-checks", () => {
    const s = summarize([
      graded("a", ["stated"], [true, true, null]),
      graded("a", ["stated"], [true, false, null]),
      graded("b", ["weather"], [true, true, true]),
    ]);
    expect(s.perCheck.formality_fits).toEqual({ rate: 1, n: 1 });
    expect(s.perCheck.warmth_fits.rate).toBeCloseTo(2 / 3);
    expect(s.overall).toBeCloseTo(2 / 3);
    expect(s.perCase).toEqual({ a: { passed: 1, runs: 2 }, b: { passed: 1, runs: 1 } });
    expect(s.perTag.stated).toEqual({ rate: 0.5, n: 2 });
    expect(s.totalCostUsd).toBeCloseTo(0.15);
  });
});
