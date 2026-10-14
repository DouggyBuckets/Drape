import { writeFileSync } from "node:fs";
import { renderLabelingGuide } from "../src/eval/labeling-guide.js";

writeFileSync(new URL("../eval/LABELING.md", import.meta.url), renderLabelingGuide());
console.log("Wrote eval/LABELING.md");
