import type { Category, WardrobeItem } from "./api";

/** Head-to-toe display order. A dress takes the place of top + bottom. */
export const CATEGORY_ORDER: Category[] = ["outerwear", "top", "dress", "bottom", "shoes", "accessory"];

export const CATEGORY_LABEL: Record<Category, string> = {
  outerwear: "Outerwear", top: "Tops", dress: "Dresses", bottom: "Bottoms", shoes: "Shoes", accessory: "Accessories",
};

export const CATEGORY_SINGULAR: Record<Category, string> = {
  outerwear: "Outerwear", top: "Top", dress: "Dress", bottom: "Bottom", shoes: "Shoes", accessory: "Accessory",
};

export const CATEGORY_ICON: Record<Category, string> = {
  outerwear: "🧥", top: "👕", dress: "👗", bottom: "👖", shoes: "👟", accessory: "🧣",
};

// Same wording as the extraction rubric's level names.
export const FORMALITY_LABEL: Record<number, string> = {
  1: "Athletic", 2: "Casual", 3: "Smart casual", 4: "Business", 5: "Formal",
};
export const WARMTH_LABEL: Record<number, string> = {
  1: "Very light", 2: "Light", 3: "Medium", 4: "Warm", 5: "Very warm",
};

export function sortHeadToToe<T extends { category: Category }>(items: T[]): T[] {
  return [...items].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
}

export function groupByCategory(items: WardrobeItem[]) {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    items: items.filter((i) => i.category === category),
  })).filter((g) => g.items.length > 0);
}

const COLOR_HEX: Record<string, string> = {
  black: "#1f1f1f", white: "#f4f2ee", gray: "#8c8c8c", navy: "#1f2f54", blue: "#3e6fb0", brown: "#6b4a2f",
  beige: "#d8c3a0", green: "#4f7a4a", red: "#b23a32", pink: "#e58fb0", purple: "#6e4a8e", yellow: "#e8c547",
  orange: "#e0823a",
};

/** CSS background for a placeholder swatch; "multi" (patterns) gets a striped gradient. */
export function swatch(color: string): string {
  if (color === "multi") return "linear-gradient(135deg, #b23a32 0 25%, #e8c547 25% 50%, #3e6fb0 50% 75%, #4f7a4a 75%)";
  return COLOR_HEX[color] ?? "#bbb";
}
