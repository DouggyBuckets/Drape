import { ItemAttributesSchema } from "../extraction/schema.js";
import type { Label } from "./extraction-metrics.js";

export const LABEL_COLUMNS = ["file", "category", "color", "formality", "warmth", "seasons"] as const;

const LabelSchema = ItemAttributesSchema.omit({ name: true });

/**
 * Parses the hand-labeled CSV. Seasons are separated by ';' (e.g. "spring;fall").
 * Every row is validated with the same Zod schema the model output must satisfy,
 * so a label typo fails loudly instead of silently lowering accuracy.
 */
export function parseLabelsCsv(text: string): { file: string; label: Label }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const [header, ...rows] = lines;
  if (header !== LABEL_COLUMNS.join(",")) {
    throw new Error(`labels CSV header must be exactly: ${LABEL_COLUMNS.join(",")}`);
  }

  const errors: string[] = [];
  const parsed = rows.flatMap((line, i) => {
    const cells = line.split(",").map((c) => c.trim());
    if (cells.length !== LABEL_COLUMNS.length) {
      errors.push(`row ${i + 2}: expected ${LABEL_COLUMNS.length} columns, got ${cells.length}`);
      return [];
    }
    const [file, category, color, formality, warmth, seasons] = cells as [string, ...string[]];
    const result = LabelSchema.safeParse({
      category,
      color,
      formality: Number(formality),
      warmth: Number(warmth),
      seasons: seasons!.split(";").map((s) => s.trim()).filter(Boolean),
    });
    if (!result.success) {
      const why = result.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ");
      errors.push(`row ${i + 2} (${file}): ${why}`);
      return [];
    }
    return [{ file, label: result.data }];
  });

  if (errors.length) throw new Error(`Invalid labels CSV:\n  ${errors.join("\n  ")}`);
  return parsed;
}
