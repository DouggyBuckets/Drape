import type { ItemAttributes } from "../extraction/schema.js";

export type Label = Omit<ItemAttributes, "name">;

export interface EvalCase {
  file: string;
  label: Label;
  /** null when extraction failed; counts as wrong on every attribute. */
  prediction: ItemAttributes | null;
  error?: string;
}

export interface CategoricalScore { kind: "categorical"; accuracy: number }
export interface OrdinalScore { kind: "ordinal"; accuracy: number; withinOne: number; meanAbsError: number | null }
export interface SetScore { kind: "set"; accuracy: number; meanJaccard: number }

export interface ExtractionReport {
  total: number;
  failed: number;
  attributes: {
    category: CategoricalScore;
    color: CategoricalScore;
    formality: OrdinalScore;
    warmth: OrdinalScore;
    seasons: SetScore;
  };
  /** Wrong attributes on successful extractions. */
  mismatches: { file: string; attribute: keyof Label; expected: unknown; predicted: unknown }[];
  /** Items whose extraction failed (refused, invalid output, unreadable image). */
  failures: { file: string; error: string }[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function jaccard<T>(a: readonly T[], b: readonly T[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const union = new Set([...A, ...B]).size;
  if (union === 0) return 1;
  return [...A].filter((x) => B.has(x)).length / union;
}

function categorical(cases: EvalCase[], key: "category" | "color"): CategoricalScore {
  return { kind: "categorical", accuracy: mean(cases.map((c) => Number(c.prediction?.[key] === c.label[key]))) };
}

function ordinal(cases: EvalCase[], key: "formality" | "warmth"): OrdinalScore {
  const diffs = cases.map((c) => (c.prediction ? Math.abs(c.prediction[key] - c.label[key]) : null));
  const predicted = diffs.filter((d): d is number => d !== null);
  return {
    kind: "ordinal",
    accuracy: mean(diffs.map((d) => Number(d === 0))),
    withinOne: mean(diffs.map((d) => Number(d !== null && d <= 1))),
    // Only over successful extractions; failures are already counted in accuracy.
    meanAbsError: predicted.length ? mean(predicted) : null,
  };
}

function seasons(cases: EvalCase[]): SetScore {
  const j = cases.map((c) => (c.prediction ? jaccard(c.prediction.seasons, c.label.seasons) : 0));
  return { kind: "set", accuracy: mean(j.map((x) => Number(x === 1))), meanJaccard: mean(j) };
}

export function scoreExtraction(cases: EvalCase[]): ExtractionReport {
  const keys = ["category", "color", "formality", "warmth", "seasons"] as const;
  const mismatches: ExtractionReport["mismatches"] = [];
  for (const c of cases) {
    if (!c.prediction) continue;
    for (const k of keys) {
      const expected = c.label[k];
      const predicted = c.prediction[k];
      const same = k === "seasons"
        ? jaccard(predicted as string[], expected as string[]) === 1
        : predicted === expected;
      if (!same) mismatches.push({ file: c.file, attribute: k, expected, predicted });
    }
  }
  const failures = cases.filter((c) => !c.prediction).map((c) => ({ file: c.file, error: c.error ?? "unknown error" }));
  return {
    total: cases.length,
    failed: failures.length,
    attributes: {
      category: categorical(cases, "category"),
      color: categorical(cases, "color"),
      formality: ordinal(cases, "formality"),
      warmth: ordinal(cases, "warmth"),
      seasons: seasons(cases),
    },
    mismatches,
    failures,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function formatReport(r: ExtractionReport): string {
  const rows = Object.entries(r.attributes).map(([name, s]) => {
    const extra =
      s.kind === "ordinal"
        ? `within ±1: ${pct(s.withinOne)}   MAE: ${s.meanAbsError?.toFixed(2) ?? "n/a"}`
        : s.kind === "set"
          ? `mean Jaccard: ${s.meanJaccard.toFixed(2)}`
          : "";
    return `  ${name.padEnd(10)} ${pct(s.accuracy).padStart(6)}   ${extra}`.trimEnd();
  });
  const fmt = (v: unknown) => (Array.isArray(v) ? v.join("+") : String(v));
  const misses = r.mismatches.map(
    (m) => `  ${m.file}  ${m.attribute}: expected ${fmt(m.expected)}, got ${fmt(m.predicted)}`,
  );
  return [
    `Items: ${r.total}   extraction failures: ${r.failed}`,
    "",
    "Exact-match accuracy per attribute:",
    ...rows,
    "",
    misses.length ? `Mismatches (${misses.length}):` : "No mismatches.",
    ...misses,
    ...(r.failures.length
      ? ["", `Failed extractions (${r.failures.length}, scored as wrong):`, ...r.failures.map((f) => `  ${f.file}  ${f.error}`)]
      : []),
  ].join("\n");
}
