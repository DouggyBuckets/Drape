// Sanity checks on the eval itself: a case the wardrobe can't satisfy would fail forever
// and make the agent look worse than it is.
import { describe, expect, it } from "vitest";
import { loadFixtureWardrobe } from "../items/fixtures.js";
import { checkStructure, type OutfitItem } from "../outfit/rules.js";
import { EVAL_WEATHER, loadOutfitCases } from "./outfit-cases.js";
import { warmthFits } from "./outfit-checks.js";

const wardrobe: OutfitItem[] = loadFixtureWardrobe().map((a, i) => ({ id: `f${i}`, ...a }));
const of = (c: OutfitItem["category"]) => wardrobe.filter((i) => i.category === c);

/** Every structurally valid outfit (accessories ignored: they don't affect fit). */
function* allOutfits(): Generator<OutfitItem[]> {
  const bases = [...of("top").flatMap((t) => of("bottom").map((b) => [t, b])), ...of("dress").map((d) => [d])];
  for (const base of bases)
    for (const shoes of of("shoes"))
      for (const outer of [null, ...of("outerwear")]) yield [...base, shoes, ...(outer ? [outer] : [])];
}

describe("outfit eval cases", () => {
  const cases = loadOutfitCases();

  it("load with unique ids", () => {
    expect(cases.length).toBe(18);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s is satisfiable by the fixture wardrobe", (_id, c) => {
    const [fLo, fHi] = c.expect.formality;
    const ok = [...allOutfits()].some(
      (o) =>
        checkStructure(o).every((r) => r.passed) &&
        o.every((i) => i.formality >= fLo - 1 && i.formality <= fHi + 1) &&
        warmthFits(o, c.expect.temperatureF).passed,
    );
    expect(ok).toBe(true);
  });

  it("only uses locations the fixed weather knows", async () => {
    for (const c of cases.filter((x) => x.location)) await expect(EVAL_WEATHER.getWeather(c.location!)).resolves.toBeDefined();
  });
});
