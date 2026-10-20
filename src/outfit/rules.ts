// Deterministic outfit rules, shared by the agent's tools and the Stage 4 eval.
// Structural rules are hard constraints (submit_outfit rejects violations);
// fit rules (warmth, formality) are reported so the agent can explain trade-offs.
import type { ItemAttributes } from "../extraction/schema.js";

export type OutfitItem = Pick<ItemAttributes, "category" | "formality" | "warmth"> & { id: string; name: string };

export interface OutfitTarget {
  temperatureF: number;
  /** 1–5 on the extraction rubric's formality scale. */
  formality: number;
}

export interface RuleResult {
  rule: string;
  kind: "structure" | "fit";
  passed: boolean;
  detail: string;
}

export const MAX_ACCESSORIES = 3;

/** Maps temperature to the rubric's warmth level (see WARMTH_LEVELS). */
export function targetWarmth(temperatureF: number): number {
  if (temperatureF > 80) return 1;
  if (temperatureF >= 65) return 2;
  if (temperatureF >= 50) return 3;
  if (temperatureF >= 32) return 4;
  return 5;
}

const label = (i: OutfitItem) => `${i.name} (${i.id})`;

export function checkStructure(items: OutfitItem[]): RuleResult[] {
  const by = (c: OutfitItem["category"]) => items.filter((i) => i.category === c);
  const [tops, bottoms, dresses, shoes, outer, acc] = (
    ["top", "bottom", "dress", "shoes", "outerwear", "accessory"] as const
  ).map(by) as [OutfitItem[], OutfitItem[], OutfitItem[], OutfitItem[], OutfitItem[], OutfitItem[]];

  const results: RuleResult[] = [];
  const add = (rule: string, passed: boolean, detail: string) =>
    results.push({ rule, kind: "structure", passed, detail });

  const ids = items.map((i) => i.id);
  const dupes = [...new Set(ids.filter((id, n) => ids.indexOf(id) !== n))];
  add("no_duplicate_items", dupes.length === 0, dupes.length ? `repeated: ${dupes.join(", ")}` : "ok");

  const base = dresses.length > 0
    ? tops.length === 0 && bottoms.length === 0
    : tops.length === 1 && bottoms.length === 1;
  add(
    "base_layer",
    base && dresses.length <= 1,
    base && dresses.length <= 1
      ? "ok"
      : `need exactly one top + one bottom, or one dress alone (got ${tops.length} top, ${bottoms.length} bottom, ${dresses.length} dress)`,
  );
  add("one_pair_of_shoes", shoes.length === 1, shoes.length === 1 ? "ok" : `need exactly 1 shoes item, got ${shoes.length}`);
  add("at_most_one_outerwear", outer.length <= 1, outer.length <= 1 ? "ok" : `got ${outer.length} outerwear items`);
  add(
    "accessory_limit",
    acc.length <= MAX_ACCESSORIES,
    acc.length <= MAX_ACCESSORIES ? "ok" : `at most ${MAX_ACCESSORIES} accessories, got ${acc.length}`,
  );
  return results;
}

export function checkFit(items: OutfitItem[], target: OutfitTarget): RuleResult[] {
  const warmth = targetWarmth(target.temperatureF);
  const clothing = items.filter((i) => i.category !== "accessory");
  const layers = items.filter((i) => ["top", "bottom", "dress", "outerwear"].includes(i.category));
  const results: RuleResult[] = [];
  const add = (rule: string, passed: boolean, detail: string) => results.push({ rule, kind: "fit", passed, detail });

  const tooHot = clothing.filter((i) => i.warmth > warmth + 1);
  add(
    "not_too_warm",
    tooHot.length === 0,
    tooHot.length ? `too warm for ${target.temperatureF}°F (target warmth ${warmth}): ${tooHot.map(label).join(", ")}` : "ok",
  );

  const warmest = Math.max(0, ...layers.map((i) => i.warmth));
  add(
    "warm_enough",
    warmest >= warmth - 1,
    warmest >= warmth - 1 ? "ok" : `warmest layer is ${warmest}; ${target.temperatureF}°F needs at least ${warmth - 1}`,
  );

  if (warmth >= 4) {
    const hasOuter = items.some((i) => i.category === "outerwear");
    add("outerwear_when_cold", hasOuter, hasOuter ? "ok" : `${target.temperatureF}°F calls for outerwear`);
  }

  const offFormality = clothing.filter((i) => Math.abs(i.formality - target.formality) > 1);
  add(
    "formality_matches",
    offFormality.length === 0,
    offFormality.length
      ? `target formality ${target.formality}, off by more than 1: ${offFormality.map((i) => `${label(i)} = ${i.formality}`).join(", ")}`
      : "ok",
  );
  return results;
}

export function checkOutfit(items: OutfitItem[], target: OutfitTarget) {
  const results = [...checkStructure(items), ...checkFit(items, target)];
  return {
    structureOk: results.filter((r) => r.kind === "structure").every((r) => r.passed),
    allPassed: results.every((r) => r.passed),
    results,
  };
}
