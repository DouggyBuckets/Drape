import { describe, expect, it } from "vitest";
import { parseLabelsCsv } from "./labels.js";

const HEADER = "file,category,color,formality,warmth,seasons";

describe("parseLabelsCsv", () => {
  it("parses rows, numbers, and ;-separated seasons, skipping blanks and comments", () => {
    const rows = parseLabelsCsv(`${HEADER}\n# a comment\n\ncoat.jpg,outerwear,navy,4,5,fall;winter\n`);
    expect(rows).toEqual([
      { file: "coat.jpg", label: { category: "outerwear", color: "navy", formality: 4, warmth: 5, seasons: ["fall", "winter"] } },
    ]);
  });

  it("reports every invalid row with its line number", () => {
    const csv = `${HEADER}\na.jpg,top,teal,3,2,summer\nb.jpg,top,navy,6,2,summer\nc.jpg,top,navy,3`;
    expect(() => parseLabelsCsv(csv)).toThrow(/row 2 \(a\.jpg\): color[\s\S]*row 3 \(b\.jpg\): formality[\s\S]*row 4: expected 6 columns/);
  });

  it("rejects a wrong header", () => {
    expect(() => parseLabelsCsv("file,type\nx.jpg,top")).toThrow(/header/);
  });
});
