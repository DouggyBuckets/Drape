import { describe, expect, it } from "vitest";
import type { Category, WardrobeItem } from "./api";
import { groupByCategory, sortHeadToToe, swatch } from "./wardrobe";

const item = (category: Category, name: string = category): WardrobeItem => ({
  id: name, name, category, color: "navy", formality: 3, warmth: 3, seasons: [], imageUrl: null, createdAt: "",
});

describe("sortHeadToToe", () => {
  it("orders outerwear, top, bottom, shoes, then accessories", () => {
    const sorted = sortHeadToToe([item("accessory"), item("shoes"), item("bottom"), item("top"), item("outerwear")]);
    expect(sorted.map((i) => i.category)).toEqual(["outerwear", "top", "bottom", "shoes", "accessory"]);
  });

  it("puts a dress where the top would be and keeps accessory order stable", () => {
    const sorted = sortHeadToToe([item("accessory", "scarf"), item("shoes"), item("dress"), item("accessory", "belt")]);
    expect(sorted.map((i) => i.name)).toEqual(["dress", "shoes", "scarf", "belt"]);
  });
});

describe("groupByCategory", () => {
  it("groups in head-to-toe order and drops empty categories", () => {
    const groups = groupByCategory([item("shoes", "a"), item("top", "b"), item("shoes", "c")]);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.name)])).toEqual([["Tops", ["b"]], ["Shoes", ["a", "c"]]]);
  });
});

describe("swatch", () => {
  it("maps rubric colors, patterns and unknown colors", () => {
    expect(swatch("navy")).toMatch(/^#/);
    expect(swatch("multi")).toContain("gradient");
    expect(swatch("teal")).toBe("#bbb");
  });
});
