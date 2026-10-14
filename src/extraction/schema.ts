import { z } from "zod";
import { CATEGORIES, COLORS, SEASONS } from "./rubric.js";

const level = z.int().min(1).max(5);

/** What the model extracts from one photo. Also validates hand labels in the eval CSV. */
export const ItemAttributesSchema = z.object({
  name: z.string().describe("Short description, e.g. 'navy wool overcoat'"),
  category: z.enum(CATEGORIES),
  color: z.enum(COLORS),
  formality: level.describe("1–5, see rubric"),
  warmth: level.describe("1–5, see rubric"),
  seasons: z.array(z.enum(SEASONS)).min(1),
});

export type ItemAttributes = z.infer<typeof ItemAttributesSchema>;

/** The scored attributes (everything except the free-text name). */
export const SCORED_ATTRIBUTES = ["category", "color", "formality", "warmth", "seasons"] as const;
export type ScoredAttribute = (typeof SCORED_ATTRIBUTES)[number];
