import type { TraceEvent } from "./api";
import { CATEGORY_LABEL } from "./wardrobe";

type Input = Record<string, unknown>;

function range(label: string, min: unknown, max: unknown): string | null {
  if (min === undefined && max === undefined) return null;
  if (min !== undefined && max !== undefined) return min === max ? `${label} ${min}` : `${label} ${min}–${max}`;
  return min !== undefined ? `${label} ≥ ${min}` : `${label} ≤ ${max}`;
}

function describeSearch(input: Input, output: unknown): string {
  const what = typeof input.category === "string"
    ? (CATEGORY_LABEL[input.category as keyof typeof CATEGORY_LABEL] ?? input.category).toLowerCase()
    : "all items";
  const filters = [
    range("formality", input.formality_min, input.formality_max),
    range("warmth", input.warmth_min, input.warmth_max),
    typeof input.season === "string" ? input.season : null,
    Array.isArray(input.colors) && input.colors.length ? input.colors.join("/") : null,
    typeof input.name_contains === "string" ? `"${input.name_contains}"` : null,
  ].filter(Boolean);
  const count = (output as { count?: number })?.count;
  return `Searched ${what}${filters.length ? ` (${filters.join(", ")})` : ""}${count !== undefined ? `: ${count} found` : ""}`;
}

/** One plain-English line per trace step, for the "How Claude decided" panel. */
export function describeStep(e: TraceEvent): string {
  if (e.type === "text") return `Noted: “${e.text.trim()}”`;
  if (e.type === "nudge") return "Reminded Claude to submit an outfit";

  const input = e.input ?? {};
  const out = e.output as Record<string, unknown> | null;
  const error = typeof out?.error === "string" ? out.error : null;

  switch (e.name) {
    case "search_wardrobe":
      return e.isError ? `Search failed: ${error ?? "invalid filters"}` : describeSearch(input, out);
    case "get_weather": {
      if (e.isError) return `Weather lookup failed: ${error}`;
      const w = out as { location?: string; date?: string; highF?: number; lowF?: number };
      return `Checked the weather in ${w.location ?? input.location}${w.date ? ` (${w.date})` : ""}: high ${w.highF}°F, low ${w.lowF}°F`;
    }
    case "check_outfit_rules": {
      const failures = (out?.failures as { detail: string }[] | undefined) ?? [];
      const unknown = (out?.unknown_ids as string[] | undefined) ?? [];
      const target = `${input.temperature_f}°F, formality ${input.target_formality}`;
      if (!failures.length && !unknown.length) return `Checked the outfit for ${target}: all rules passed`;
      const problems = [...(unknown.length ? [`${unknown.length} unknown item(s)`] : []), ...failures.map((f) => f.detail)];
      return `Checked the outfit for ${target}: ${problems.join("; ")}`;
    }
    case "submit_outfit": {
      if (!e.isError) return "Submitted the outfit";
      const failures = (out?.failures as { detail: string }[] | undefined) ?? [];
      const unknown = (out?.unknown_ids as string[] | undefined) ?? [];
      const why = [...(unknown.length ? ["it included items not in the wardrobe"] : []), ...failures.map((f) => f.detail)];
      return `Submission rejected: ${why.join("; ") || error || "invalid outfit"}`;
    }
    default:
      return `Called ${e.name}`;
  }
}
