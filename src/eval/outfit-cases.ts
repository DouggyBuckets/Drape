import { readFileSync } from "node:fs";
import { z } from "zod";
import { fixedWeather } from "../weather/weather.js";
import type { OutfitCase } from "./outfit-checks.js";

const range = z.tuple([z.number(), z.number()]).refine(([lo, hi]) => lo <= hi, "range must be [low, high]");

const CaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  request: z.string().min(1),
  location: z.string().optional(),
  tags: z.array(z.string()).min(1),
  expect: z.object({ temperatureF: range, formality: range, needsWeather: z.boolean() }),
});

export const OUTFIT_CASES_FILE = new URL("../../eval/outfit-cases.json", import.meta.url);

export function loadOutfitCases(): OutfitCase[] {
  const cases = z.array(CaseSchema).parse(JSON.parse(readFileSync(OUTFIT_CASES_FILE, "utf8")));
  const dupes = cases.map((c) => c.id).filter((id, i, all) => all.indexOf(id) !== i);
  if (dupes.length) throw new Error(`Duplicate case ids: ${dupes.join(", ")}`);
  return cases;
}

/** Fixed "now" and weather so eval runs are repeatable. */
export const EVAL_NOW = new Date("2026-01-15T15:00:00Z");

export const EVAL_WEATHER = fixedWeather({
  chicago: { highF: 48, lowF: 34, precipitationChancePct: 10 },
  miami: { highF: 88, lowF: 76, precipitationChancePct: 20 },
  denver: { highF: 30, lowF: 15, precipitationChancePct: 5 },
  seattle: { highF: 58, lowF: 49, precipitationChancePct: 80 },
});
