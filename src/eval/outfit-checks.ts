// Grades one outfit-agent run against a test case's EXPECTED interpretation.
// Fit is judged at the expected temperature/formality, never the agent's own claims,
// and item attributes come from an independent database lookup.
import type { AgentResult } from "../agent/loop.js";
import { checkFit, checkStructure, type OutfitItem } from "../outfit/rules.js";

export interface OutfitCase {
  id: string;
  request: string;
  location?: string;
  expect: {
    /** Inclusive °F range a correct reading of the request falls in. */
    temperatureF: [number, number];
    /** Inclusive formality range (1–5) the occasion calls for. */
    formality: [number, number];
    needsWeather: boolean;
  };
  tags: string[];
}

export const CHECKS = [
  "completed", "items_exist", "one_per_slot", "warmth_fits", "formality_fits",
  "understood_temperature", "understood_formality", "weather_tool_use",
] as const;
export type CheckName = (typeof CHECKS)[number];

export interface CheckResult {
  check: CheckName;
  /** null = not applicable to this run. */
  passed: boolean | null;
  detail: string;
}

const WARMTH_RULES = new Set(["not_too_warm", "warm_enough", "outerwear_when_cold"]);
const inRange = (x: number, [lo, hi]: [number, number]) => x >= lo && x <= hi;

/** Warmth passes if the outfit fits at any whole degree in the expected range. */
export function warmthFits(items: OutfitItem[], [lo, hi]: [number, number]) {
  for (let t = lo; t <= hi; t++) {
    const fails = checkFit(items, { temperatureF: t, formality: 3 }).filter((r) => WARMTH_RULES.has(r.rule) && !r.passed);
    if (fails.length === 0) return { passed: true, detail: `fits at ${t}°F` };
  }
  const atLo = checkFit(items, { temperatureF: lo, formality: 3 }).filter((r) => WARMTH_RULES.has(r.rule) && !r.passed);
  return { passed: false, detail: atLo.map((r) => r.detail).join("; ") };
}

export function gradeRun(c: OutfitCase, r: AgentResult, lookup: Map<string, OutfitItem>): CheckResult[] {
  const usedWeather = r.trace.some((t) => t.type === "tool_call" && t.name === "get_weather");
  const weather: CheckResult = {
    check: "weather_tool_use",
    passed: usedWeather === c.expect.needsWeather,
    detail: `${usedWeather ? "called" : "did not call"} get_weather; ${c.expect.needsWeather ? "needed" : "not needed"}`,
  };

  if (r.status !== "ok" || !r.outfit) {
    const none = (check: CheckName): CheckResult => ({ check, passed: false, detail: `no outfit (${r.status})` });
    return [
      { check: "completed", passed: false, detail: r.status },
      ...CHECKS.filter((k) => k !== "completed" && k !== "weather_tool_use").map(none),
      weather,
    ];
  }

  const ids = r.outfit.items.map((i) => i.id);
  const missing = ids.filter((id) => !lookup.has(id));
  const items = ids.flatMap((id) => lookup.get(id) ?? []);
  const structureFails = checkStructure(items).filter((x) => !x.passed);
  const warmth = warmthFits(items, c.expect.temperatureF);

  const [fLo, fHi] = c.expect.formality;
  const offFormality = items.filter((i) => i.category !== "accessory" && (i.formality < fLo - 1 || i.formality > fHi + 1));
  const formality: CheckResult = {
    check: "formality_fits",
    passed: offFormality.length === 0,
    detail: offFormality.length
      ? `outside ${fLo - 1}–${fHi + 1}: ${offFormality.map((i) => `${i.name}=${i.formality}`).join(", ")}`
      : "ok",
  };

  return [
    { check: "completed", passed: true, detail: `${r.iterations} iterations` },
    { check: "items_exist", passed: missing.length === 0, detail: missing.length ? `unknown: ${missing.join(", ")}` : "ok" },
    {
      check: "one_per_slot",
      passed: missing.length === 0 && structureFails.length === 0,
      detail: structureFails.map((x) => x.detail).join("; ") || "ok",
    },
    { check: "warmth_fits", ...warmth },
    formality,
    {
      check: "understood_temperature",
      passed: inRange(r.outfit.temperatureF, c.expect.temperatureF),
      detail: `used ${r.outfit.temperatureF}°F, expected ${c.expect.temperatureF.join("–")}`,
    },
    {
      check: "understood_formality",
      passed: inRange(r.outfit.targetFormality, c.expect.formality),
      detail: `used ${r.outfit.targetFormality}, expected ${c.expect.formality.join("–")}`,
    },
    weather,
  ];
}

export interface GradedRun {
  caseId: string;
  tags: string[];
  checks: CheckResult[];
  iterations: number;
  latencyMs: number;
  costUsd: number;
}

const passedAll = (checks: CheckResult[]) => checks.every((c) => c.passed !== false);

export function summarize(runs: GradedRun[]) {
  const rate = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : null);
  const perCheck = Object.fromEntries(
    CHECKS.map((k) => {
      const applicable = runs.flatMap((r) => r.checks.filter((c) => c.check === k && c.passed !== null).map((c) => c.passed as boolean));
      return [k, { rate: rate(applicable), n: applicable.length }];
    }),
  ) as Record<CheckName, { rate: number | null; n: number }>;

  const tags = [...new Set(runs.flatMap((r) => r.tags))].sort();
  const perTag = Object.fromEntries(tags.map((t) => {
    const rs = runs.filter((r) => r.tags.includes(t));
    return [t, { rate: rate(rs.map((r) => passedAll(r.checks))), n: rs.length }];
  }));

  const caseIds = [...new Set(runs.map((r) => r.caseId))];
  const perCase = Object.fromEntries(caseIds.map((id) => {
    const rs = runs.filter((r) => r.caseId === id);
    return [id, { passed: rs.filter((r) => passedAll(r.checks)).length, runs: rs.length }];
  }));

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  return {
    runs: runs.length,
    overall: rate(runs.map((r) => passedAll(r.checks))),
    perCheck,
    perTag,
    perCase,
    meanIterations: mean(runs.map((r) => r.iterations)),
    meanLatencyMs: mean(runs.map((r) => r.latencyMs)),
    totalCostUsd: runs.reduce((a, r) => a + r.costUsd, 0),
  };
}

export type OutfitEvalSummary = ReturnType<typeof summarize>;

const pct = (x: number | null) => (x === null ? "  n/a" : `${(x * 100).toFixed(0).padStart(4)}%`);

export function formatSummary(s: OutfitEvalSummary, failures: { caseId: string; check: string; detail: string }[]): string {
  return [
    `Runs: ${s.runs}   all checks passed: ${pct(s.overall).trim()}`,
    `Mean iterations ${s.meanIterations.toFixed(1)}   mean latency ${(s.meanLatencyMs / 1000).toFixed(1)}s   cost ≈ $${s.totalCostUsd.toFixed(2)}`,
    "",
    "Pass rate per check:",
    ...Object.entries(s.perCheck).map(([k, v]) => `  ${k.padEnd(24)} ${pct(v.rate)}  (n=${v.n})`),
    "",
    "All-checks pass rate per tag:",
    ...Object.entries(s.perTag).map(([k, v]) => `  ${k.padEnd(24)} ${pct(v.rate)}  (n=${v.n})`),
    "",
    "Per case (runs passing all checks):",
    ...Object.entries(s.perCase).map(([k, v]) => `  ${k.padEnd(24)} ${v.passed}/${v.runs}`),
    "",
    failures.length ? `Failures (${failures.length}):` : "No failures.",
    ...failures.map((f) => `  ${f.caseId}  ${f.check}: ${f.detail}`),
  ].join("\n");
}
