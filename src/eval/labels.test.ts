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

  it("reports every invalid row with its file line number, counting comment lines", () => {
    const csv = `# comment\n${HEADER}\na.jpg,top,teal,3,2,summer\nb.jpg,top,navy,6,2,summer\nc.jpg,top,navy,3`;
    expect(() => parseLabelsCsv(csv)).toThrow(/line 3 \(a\.jpg\): color[\s\S]*line 4 \(b\.jpg\): formality[\s\S]*line 5: expected 6 columns/);
  });

  it("hints at the season separator when there are extra columns", () => {
    expect(() => parseLabelsCsv(`${HEADER}\na.jpg,top,navy,3,2,spring,summer`)).toThrow(/line 2: .*separate seasons with ';'/);
  });

  it("rejects a wrong header", () => {
    expect(() => parseLabelsCsv("file,type\nx.jpg,top")).toThrow(/header/);
  });
});
