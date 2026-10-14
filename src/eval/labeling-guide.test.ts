import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { renderLabelingGuide } from "./labeling-guide.js";

it("eval/LABELING.md is in sync with the rubric (run `npm run labeling-guide`)", () => {
  expect(readFileSync(new URL("../../eval/LABELING.md", import.meta.url), "utf8")).toBe(renderLabelingGuide());
});
