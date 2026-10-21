import type Anthropic from "@anthropic-ai/sdk";
import { transformJSONSchema } from "@anthropic-ai/sdk/lib/transform-json-schema";
import { z } from "zod";
import type { Queryable } from "../db/pool.js";
import { CATEGORIES, COLORS, SEASONS } from "../extraction/rubric.js";
import { getItemsByIds, searchItems, type WardrobeItem } from "../items/repository.js";
import { checkOutfit, type OutfitItem, type RuleResult } from "../outfit/rules.js";
import type { WeatherProvider } from "../weather/weather.js";

const level = z.int().min(1).max(5);

const SearchInput = z.object({
  category: z.enum(CATEGORIES).optional(),
  colors: z.array(z.enum(COLORS)).optional().describe("Match any of these colors"),
  formality_min: level.optional(),
  formality_max: level.optional(),
  warmth_min: level.optional(),
  warmth_max: level.optional(),
  season: z.enum(SEASONS).optional(),
  name_contains: z.string().optional().describe("Case-insensitive keyword in the item name, e.g. 'wool'"),
});

const WeatherInput = z.object({
  location: z.string().describe("City name, e.g. 'Chicago'"),
  date: z.iso.date().optional().describe("YYYY-MM-DD within the next 7 days; omit for today"),
});

const OutfitInput = z.object({
  item_ids: z.array(z.string()).describe("Wardrobe item ids from search_wardrobe results"),
  temperature_f: z.number().describe("Temperature the outfit is for, in °F"),
  target_formality: level.describe("Formality level the occasion calls for (1–5 rubric)"),
});

const SubmitInput = OutfitInput.extend({
  explanation: z.string().describe("One or two sentences for the user: why this outfit, and any compromises"),
});

export type SubmitInput = z.infer<typeof SubmitInput>;

export interface AcceptedOutfit {
  items: WardrobeItem[];
  explanation: string;
  temperatureF: number;
  targetFormality: number;
  /** Fit rules that failed (warmth/formality); structure is guaranteed valid. */
  warnings: RuleResult[];
}

/** What a tool run returns to the loop. `accepted` is set only by a valid submit_outfit. */
export interface ToolOutcome {
  content: unknown;
  isError: boolean;
  accepted?: AcceptedOutfit;
}

export interface ToolDeps {
  db: Queryable;
  weather: WeatherProvider;
  /**
   * Whose wardrobe the tools can see. Comes from the authenticated session, never from
   * model input: no tool schema has a user field, so the model can't ask for another user.
   */
  userId: string;
}

const summarize = (i: WardrobeItem) => ({
  id: i.id, name: i.name, category: i.category, color: i.color,
  formality: i.formality, warmth: i.warmth, seasons: i.seasons,
});

const toOutfitItem = (i: WardrobeItem): OutfitItem => ({
  id: i.id, name: i.name, category: i.category, formality: i.formality, warmth: i.warmth,
});

/** Resolves ids against the database and runs every rule. */
async function evaluate(db: Queryable, userId: string, input: z.infer<typeof OutfitInput>) {
  const found = await getItemsByIds(db, userId, input.item_ids);
  const byId = new Map(found.map((i) => [i.id, i]));
  const unknownIds = [...new Set(input.item_ids.filter((id) => !byId.has(id)))];
  const items = input.item_ids.flatMap((id) => byId.get(id) ?? []);
  const check = checkOutfit(items.map(toOutfitItem), {
    temperatureF: input.temperature_f,
    formality: input.target_formality,
  });
  return { items, unknownIds, ...check };
}

const failures = (rs: RuleResult[]) => rs.filter((r) => !r.passed).map(({ rule, detail }) => ({ rule, detail }));

interface ToolSpec<S extends z.ZodType> {
  description: string;
  input: S;
  run: (input: z.infer<S>, deps: ToolDeps) => Promise<ToolOutcome>;
}

const spec = <S extends z.ZodType>(s: ToolSpec<S>) => s;

export const TOOLS = {
  search_wardrobe: spec({
    description:
      "Search the user's wardrobe. All filters are optional and combine with AND. Returns at most 25 items, " +
      "each with its id. Only ids returned by this tool exist. Run several narrow searches (e.g. one per category) " +
      "rather than one broad one.",
    input: SearchInput,
    async run(i, { db, userId }) {
      const items = await searchItems(db, userId, {
        category: i.category, colors: i.colors,
        formalityMin: i.formality_min, formalityMax: i.formality_max,
        warmthMin: i.warmth_min, warmthMax: i.warmth_max,
        season: i.season, nameContains: i.name_contains,
      });
      return { content: { count: items.length, items: items.map(summarize) }, isError: false };
    },
  }),

  get_weather: spec({
    description:
      "Get the forecast high/low (°F) for a city, today or a date in the next 7 days. " +
      "Only call this when the request does not already state a temperature.",
    input: WeatherInput,
    async run(i, { weather }) {
      return { content: await weather.getWeather(i.location, i.date), isError: false };
    },
  }),

  check_outfit_rules: spec({
    description:
      "Check a candidate outfit before submitting. Reports unknown ids, structure problems (slots), and fit " +
      "problems (warmth for the temperature, formality for the occasion).",
    input: OutfitInput,
    async run(i, { db, userId }) {
      const r = await evaluate(db, userId, i);
      return {
        content: {
          unknown_ids: r.unknownIds,
          structure_ok: r.structureOk && r.unknownIds.length === 0,
          all_rules_passed: r.allPassed && r.unknownIds.length === 0,
          failures: failures(r.results),
        },
        isError: false,
      };
    },
  }),

  submit_outfit: spec({
    description:
      "Submit the final outfit. Rejected if any id is unknown or the slots are invalid; fix and resubmit. " +
      "Warmth/formality problems are accepted as warnings, so mention any compromise in the explanation.",
    input: SubmitInput,
    async run(i, { db, userId }) {
      const r = await evaluate(db, userId, i);
      if (r.unknownIds.length || !r.structureOk) {
        return {
          content: {
            accepted: false,
            unknown_ids: r.unknownIds,
            failures: failures(r.results.filter((x) => x.kind === "structure")),
          },
          isError: true,
        };
      }
      const warnings = r.results.filter((x) => !x.passed);
      return {
        content: { accepted: true },
        isError: false,
        accepted: {
          items: r.items,
          explanation: i.explanation,
          temperatureF: i.temperature_f,
          targetFormality: i.target_formality,
          warnings,
        },
      };
    },
  }),
} as const;

export type ToolName = keyof typeof TOOLS;

function toInputSchema(schema: z.ZodType): Anthropic.Beta.BetaTool.InputSchema {
  const { $schema: _, ...json } = z.toJSONSchema(schema) as Record<string, unknown>;
  // Moves constraints strict mode doesn't support (e.g. minimum/maximum) into descriptions.
  return transformJSONSchema(json) as Anthropic.Beta.BetaTool.InputSchema;
}

/** API tool definitions. strict: true guarantees inputs match the schema shape. */
export const TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = Object.entries(TOOLS).map(([name, t]) => ({
  name,
  description: t.description,
  strict: true,
  input_schema: toInputSchema(t.input),
}));

/**
 * Runs one tool call. Inputs are re-validated with Zod (strict mode can't express every
 * constraint, e.g. 1–5 ranges). Any failure becomes an is_error result the model can react to,
 * rather than an exception that kills the loop.
 */
export async function runTool(name: string, rawInput: unknown, deps: ToolDeps): Promise<ToolOutcome> {
  const tool = TOOLS[name as ToolName];
  if (!tool) return { content: { error: `Unknown tool: ${name}` }, isError: true };
  const parsed = tool.input.safeParse(rawInput);
  if (!parsed.success) {
    return { content: { error: "Invalid input", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, isError: true };
  }
  try {
    // The cast is safe: parsed.data was produced by this tool's own schema.
    return await (tool.run as (i: unknown, d: ToolDeps) => Promise<ToolOutcome>)(parsed.data, deps);
  } catch (err) {
    return { content: { error: (err as Error).message }, isError: true };
  }
}
