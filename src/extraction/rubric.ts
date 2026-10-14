// Single source of truth for attribute vocabularies and level definitions.
// Rendered into both the extraction prompt and eval/LABELING.md, so the model
// and the human labeler use identical definitions.

export const CATEGORIES = ["top", "bottom", "outerwear", "shoes", "dress", "accessory"] as const;

export const COLORS = [
  "black", "white", "gray", "navy", "blue", "brown", "beige",
  "green", "red", "pink", "purple", "yellow", "orange", "multi",
] as const;

export const SEASONS = ["spring", "summer", "fall", "winter"] as const;

export const CATEGORY_NOTES: Record<(typeof CATEGORIES)[number], string> = {
  top: "shirts, t-shirts, blouses, sweaters, hoodies, cardigans worn as a main layer",
  bottom: "trousers, jeans, shorts, skirts",
  outerwear: "coats, jackets, blazers, rain shells — worn over a top",
  shoes: "any footwear",
  dress: "dresses and jumpsuits (replaces both top and bottom)",
  accessory: "belts, scarves, hats, bags, ties, jewelry",
};

export const COLOR_NOTES =
  "The single dominant color by visible area. Use 'multi' only when no color covers about half the item " +
  "(e.g. bold stripes, plaid, florals). Cream/tan/khaki → beige; charcoal → gray; denim blue → blue unless very dark (navy).";

export const FORMALITY_LEVELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Athletic / lounge — gym wear, sweatpants, slides, graphic hoodies",
  2: "Casual — t-shirts, jeans, sneakers, casual shorts",
  3: "Smart casual — polos, button-downs, chinos, knit sweaters, clean leather sneakers, loafers",
  4: "Business — dress shirts, tailored trousers, blazers, dress shoes, sheath dresses",
  5: "Formal — suits, tuxedos, evening gowns, patent dress shoes",
};

export const WARMTH_LEVELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Very light — tank tops, linen, shorts, sandals; for hot weather (above ~80°F / 27°C)",
  2: "Light — t-shirts, thin shirts, light dresses, canvas sneakers (~65–80°F / 18–27°C)",
  3: "Medium — long sleeves, jeans, light knits, light jackets (~50–65°F / 10–18°C)",
  4: "Warm — heavy sweaters, wool trousers, lined jackets, leather boots (~32–50°F / 0–10°C)",
  5: "Very warm — parkas, down coats, insulated boots (below ~32°F / 0°C)",
};

export const SEASON_NOTES =
  "Every season the item is reasonable to wear in. Most items have more than one. " +
  "A t-shirt is spring/summer/fall; a down parka is winter only; jeans are often all four.";
