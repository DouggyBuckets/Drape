import { describe, expect, it } from "vitest";
import { checkFit, checkOutfit, checkStructure, type OutfitItem, targetWarmth } from "./rules.js";

let n = 0;
const item = (category: OutfitItem["category"], formality = 3, warmth = 3): OutfitItem => ({
  id: `id-${++n}`, name: category, category, formality, warmth,
});
const failed = (rs: { rule: string; passed: boolean }[]) => rs.filter((r) => !r.passed).map((r) => r.rule);

describe("targetWarmth", () => {
  it.each([[95, 1], [80, 2], [65, 2], [64, 3], [50, 3], [45, 4], [32, 4], [20, 5]])("%i°F → %i", (t, w) => {
    expect(targetWarmth(t)).toBe(w);
  });
});

describe("checkStructure", () => {
  it("accepts top + bottom + shoes, with optional outerwear and up to 3 accessories", () => {
    const outfit = [item("top"), item("bottom"), item("shoes"), item("outerwear"), item("accessory"), item("accessory"), item("accessory")];
    expect(failed(checkStructure(outfit))).toEqual([]);
  });

  it("accepts a dress + shoes", () => {
    expect(failed(checkStructure([item("dress"), item("shoes")]))).toEqual([]);
  });

  it("rejects missing or extra base layers", () => {
    expect(failed(checkStructure([item("top"), item("shoes")]))).toEqual(["base_layer"]);
    expect(failed(checkStructure([item("top"), item("top"), item("bottom"), item("shoes")]))).toEqual(["base_layer"]);
    expect(failed(checkStructure([item("dress"), item("top"), item("shoes")]))).toEqual(["base_layer"]);
  });

  it("rejects shoe, outerwear, accessory and duplicate violations", () => {
    const top = item("top");
    const outfit = [top, top, item("bottom"), item("outerwear"), item("outerwear"),
      item("accessory"), item("accessory"), item("accessory"), item("accessory")];
    expect(failed(checkStructure(outfit))).toEqual([
      "no_duplicate_items", "base_layer", "one_pair_of_shoes", "at_most_one_outerwear", "accessory_limit",
    ]);
  });
});

describe("checkFit", () => {
  it("passes a 45°F smart casual outfit with a jacket", () => {
    const outfit = [item("top", 3, 3), item("bottom", 3, 3), item("shoes", 3, 3), item("outerwear", 3, 4)];
    expect(failed(checkFit(outfit, { temperatureF: 45, formality: 3 }))).toEqual([]);
  });

  it("flags items too warm for hot weather, ignoring accessories", () => {
    const outfit = [item("top", 2, 2), item("bottom", 2, 4), item("shoes", 2, 1), item("accessory", 2, 5)];
    expect(failed(checkFit(outfit, { temperatureF: 90, formality: 2 }))).toEqual(["not_too_warm"]);
  });

  it("flags an outfit too light for the cold and missing outerwear", () => {
    const outfit = [item("top", 3, 2), item("bottom", 3, 2), item("shoes", 3, 2)];
    expect(failed(checkFit(outfit, { temperatureF: 20, formality: 3 }))).toEqual(["warm_enough", "outerwear_when_cold"]);
  });

  it("flags items more than one formality level off", () => {
    const outfit = [item("top", 5, 3), item("bottom", 3, 3), item("shoes", 1, 3)];
    const r = checkFit(outfit, { temperatureF: 60, formality: 3 });
    expect(failed(r)).toEqual(["formality_matches"]);
    expect(r.find((x) => x.rule === "formality_matches")?.detail).toMatch(/= 5.*= 1/);
  });
});

describe("checkOutfit", () => {
  it("separates structural validity from fit", () => {
    const outfit = [item("top", 5, 3), item("bottom", 3, 3), item("shoes", 3, 3)];
    expect(checkOutfit(outfit, { temperatureF: 60, formality: 3 })).toMatchObject({ structureOk: true, allPassed: false });
  });
});
