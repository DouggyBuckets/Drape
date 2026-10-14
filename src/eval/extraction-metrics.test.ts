import { describe, expect, it } from "vitest";
import { type EvalCase, formatReport, jaccard, scoreExtraction } from "./extraction-metrics.js";

const label = { category: "top", color: "navy", formality: 3, warmth: 2, seasons: ["spring", "summer"] } as const;
const pred = (over: Partial<EvalCase["prediction"] & object> = {}) => ({
  name: "shirt", ...label, seasons: [...label.seasons], ...over,
});

describe("jaccard", () => {
  it("is intersection over union, ignoring order", () => {
    expect(jaccard(["a", "b"], ["b", "a"])).toBe(1);
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(1);
  });
});

describe("scoreExtraction", () => {
  const cases: EvalCase[] = [
    { file: "a.jpg", label: { ...label, seasons: [...label.seasons] }, prediction: pred() },
    { file: "b.jpg", label: { ...label, seasons: [...label.seasons] }, prediction: pred({ formality: 4, color: "blue", seasons: ["summer"] }) },
    { file: "c.jpg", label: { ...label, seasons: [...label.seasons] }, prediction: pred({ warmth: 5 }) },
    { file: "d.jpg", label: { ...label, seasons: [...label.seasons] }, prediction: null, error: "refused" },
  ];
  const r = scoreExtraction(cases);

  it("counts failures as wrong on every attribute", () => {
    expect(r.failed).toBe(1);
    expect(r.attributes.category.accuracy).toBe(0.75);
  });

  it("scores ordinal attributes with exact, within-one, and MAE over successful extractions", () => {
    expect(r.attributes.formality).toEqual({ kind: "ordinal", accuracy: 0.5, withinOne: 0.75, meanAbsError: 1 / 3 });
    expect(r.attributes.warmth).toMatchObject({ accuracy: 0.5, withinOne: 0.5, meanAbsError: 1 });
  });

  it("scores seasons as exact set match plus mean Jaccard", () => {
    expect(r.attributes.seasons.accuracy).toBe(0.5);
    expect(r.attributes.seasons.meanJaccard).toBeCloseTo((1 + 0.5 + 1 + 0) / 4);
  });

  it("lists mismatches for successful extractions and failures once each", () => {
    expect(r.mismatches.filter((m) => m.file === "b.jpg").map((m) => m.attribute)).toEqual(["color", "formality", "seasons"]);
    expect(r.mismatches.some((m) => m.file === "d.jpg")).toBe(false);
    expect(r.failures).toEqual([{ file: "d.jpg", error: "refused" }]);
    const text = formatReport(r);
    expect(text).toContain("b.jpg  seasons: expected spring+summer, got summer");
    expect(text).toContain("d.jpg  refused");
  });
});
