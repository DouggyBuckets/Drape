// Compares model extraction against hand labels and reports accuracy per attribute.
// Usage: npm run eval:extraction -- [--labels eval/labels.dev.csv] [--effort low] [--limit 5] [--concurrency 4]
// eval/labels.csv is the held-out test set (report these); eval/labels.dev.csv is for tuning.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ExtractionError } from "../src/extraction/errors.js";
import { type Effort, EXTRACTION_VERSION, type ExtractionResult, extractAttributes } from "../src/extraction/extract.js";
import { type EvalCase, formatReport, scoreExtraction } from "../src/eval/extraction-metrics.js";
import { parseLabelsCsv } from "../src/eval/labels.js";
import { MODEL } from "../src/llm/client.js";

// List price for claude-opus-5-5, USD per million tokens. Estimate only; check current pricing.
const PRICE = { input: 4, output: 20 };

const { values: args } = parseArgs({
  options: {
    labels: { type: "string", default: "eval/labels.csv" },
    images: { type: "string", default: "images" },
    effort: { type: "string", default: "low" },
    concurrency: { type: "string", default: "4" },
    limit: { type: "string" },
    out: { type: "string", default: "eval/results" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
if (!EFFORTS.includes(args.effort)) fail(`--effort must be one of ${EFFORTS.join(", ")}`);
const effort = args.effort as Effort;

if (!existsSync(args.labels)) fail(`No labels at ${args.labels}. Copy eval/labels.example.csv (header) and see eval/LABELING.md.`);
let rows: ReturnType<typeof parseLabelsCsv>;
try {
  rows = parseLabelsCsv(readFileSync(args.labels, "utf8"));
} catch (err) {
  fail((err as Error).message);
}
if (args.limit) rows = rows.slice(0, Number(args.limit));

// Fail before spending any tokens if a labeled photo is missing.
const missing = rows.filter((r) => !existsSync(path.join(args.images, r.file))).map((r) => r.file);
if (missing.length) fail(`Missing images in ${args.images}/: ${missing.join(", ")}`);

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const labelSet = path.basename(args.labels, ".csv").replace(/^labels\.?/, "") || "test";
console.log(`Extracting ${rows.length} items (${labelSet} set) with ${MODEL}, effort ${effort}, prompt ${EXTRACTION_VERSION}...`);
let done = 0;
let runs: { row: (typeof rows)[number]; result: ExtractionResult | null; error?: string }[];
try {
  runs = await mapWithConcurrency(rows, Number(args.concurrency), async (row) => {
    let result: ExtractionResult | null = null;
    let error: string | undefined;
    try {
      result = await extractAttributes(readFileSync(path.join(args.images, row.file)), { effort });
    } catch (err) {
      // Only model-side outcomes count against accuracy. Anything else (bad API key,
      // network, malformed request) is an infrastructure problem: abort the run.
      if (!(err instanceof ExtractionError)) throw err;
      error = `${err.code}: ${err.message}`;
    }
    process.stdout.write(`\r  ${++done}/${rows.length}`);
    return { row, result, error };
  });
} catch (err) {
  fail(`\nRun aborted (not a model error): ${(err as Error).message}`);
}
console.log("\n");

const cases: EvalCase[] = runs.map(({ row, result, error }) => ({
  file: row.file,
  label: row.label,
  prediction: result?.attributes ?? null,
  ...(error ? { error } : {}),
}));
const report = scoreExtraction(cases);
console.log(formatReport(report));

const usage = runs.reduce(
  (acc, r) => ({
    inputTokens: acc.inputTokens + (r.result?.usage.inputTokens ?? 0),
    outputTokens: acc.outputTokens + (r.result?.usage.outputTokens ?? 0),
  }),
  { inputTokens: 0, outputTokens: 0 },
);
const cost = (usage.inputTokens * PRICE.input + usage.outputTokens * PRICE.output) / 1e6;
console.log(`\nTokens: ${usage.inputTokens} in / ${usage.outputTokens} out   ≈ $${cost.toFixed(3)} at list price`);

mkdirSync(args.out, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = path.join(args.out, `extraction-${labelSet}-${stamp}-${effort}.json`);
writeFileSync(
  outFile,
  JSON.stringify(
    {
      model: MODEL,
      effort,
      promptVersion: EXTRACTION_VERSION,
      labelsFile: args.labels,
      ranAt: new Date().toISOString(),
      usage,
      estimatedCostUsd: cost,
      report,
      cases: runs.map(({ row, result, error }) => ({
        file: row.file,
        label: row.label,
        prediction: result?.attributes ?? null,
        servedBy: result?.model ?? null,
        error: error ?? null,
      })),
    },
    null,
    2,
  ),
);
console.log(`Saved ${outFile}`);
