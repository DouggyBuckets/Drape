import {
  CATEGORIES, CATEGORY_NOTES, COLOR_NOTES, COLORS, FORMALITY_LEVELS, FORMALITY_NOTES, SEASON_NOTES, SEASONS, WARMTH_LEVELS,
} from "./rubric.js";

const levels = (defs: Record<number, string>) =>
  Object.entries(defs).map(([n, d]) => `- ${n}: ${d}`).join("\n");

/** The rubric as Markdown; shared by the system prompt and the labeling guide. */
export function renderRubric(): string {
  return `### category
${CATEGORIES.map((c) => `- ${c}: ${CATEGORY_NOTES[c]}`).join("\n")}

### color
One of: ${COLORS.join(", ")}.
${COLOR_NOTES}

### formality (1–5)
${levels(FORMALITY_LEVELS)}
${FORMALITY_NOTES}

### warmth (1–5)
${levels(WARMTH_LEVELS)}

### seasons
Any of: ${SEASONS.join(", ")}.
${SEASON_NOTES}`;
}

export const EXTRACTION_SYSTEM_PROMPT = `You catalog clothing for a personal wardrobe app. You will see a photo of one clothing item and record its attributes using the rubric below.

If the photo shows several items, describe the most prominent one. Judge the garment itself, not how it is styled in the photo. When an item falls between two levels, pick the level whose examples it most resembles.

## Rubric

${renderRubric()}`;
