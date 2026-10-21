// Runs the outfit agent over eval/outfit-cases.json against a fixed fixture wardrobe
// (database drape_eval), fixed weather and a fixed date, and reports check pass rates.
// Usage: npm run eval:outfits -- [--repeats 1] [--only <tag>] [--case <id>] [--effort medium] [--concurrency 3]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ensureDatabase, siblingDatabaseUrl } from "../src/db/setup.js";

const { values: args } = parseArgs({
  options: {
    repeats: { type: "string", default: "1" },
    only: { type: "string" },
    case: { type: "string" },
    effort: { type: "string", default: "medium" },
    concurrency: { type: "string", default: "3" },
    out: { type: "string", default: "eval/results" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// Point the app at drape_eval BEFORE importing anything that reads env config.
try {
  process.loadEnvFile();
} catch {}
if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set (see .env.example).");
const evalUrl = siblingDatabaseUrl(process.env.DATABASE_URL, "drape_eval");
await ensureDatabase(evalUrl);
process.env.DATABASE_URL = evalUrl;

const { runMigrations } = await import("../src/db/migrate.js");
const { pool } = await import("../src/db/pool.js");
const { seedFixtures } = await import("../src/items/fixtures.js");
const { listItems } = await import("../src/items/repository.js");
const { AGENT_VERSION, runOutfitAgent } = await import("../src/agent/loop.js");
const { anthropic, MODEL } = await import("../src/llm/client.js");
const { estimateCostUsd } = await import("../src/llm/pricing.js");
const { EVAL_NOW, EVAL_WEATHER, loadOutfitCases } = await import("../src/eval/outfit-cases.js");
const { formatSummary, gradeRun, summarize } = await import("../src/eval/outfit-checks.js");
type GradedRun = import("../src/eval/outfit-checks.js").GradedRun;
type Effort = import("../src/extraction/extract.js").Effort;

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
if (!EFFORTS.includes(args.effort)) fail(`--effort must be one of ${EFFORTS.join(", ")}`);
const effort = args.effort as Effort;
const repeats = Number(args.repeats);
if (!Number.isInteger(repeats) || repeats < 1) fail("--repeats must be a positive integer");

let cases = loadOutfitCases();
if (args.only) cases = cases.filter((c) => c.tags.includes(args.only!));
if (args.case) cases = cases.filter((c) => c.id === args.case);
if (!cases.length) fail("No cases match the filters.");

try {
  // Fresh, fixture-only wardrobe every run.
  await runMigrations(pool);
  await pool.query("TRUNCATE wardrobe_items");
  await seedFixtures(pool);
  const lookup = new Map((await listItems(pool)).map((i) => [i.id, i]));

  const tasks = cases.flatMap((c) => Array.from({ length: repeats }, (_, repeat) => ({ c, repeat })));
  console.log(`Running ${cases.length} cases × ${repeats} = ${tasks.length} runs with ${MODEL}, effort ${effort}, agent ${AGENT_VERSION}...`);

  let done = 0;
  const runs: (GradedRun & { repeat: number; detail: unknown })[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const idx = next++;
      const { c, repeat } = tasks[idx]!;
      const t0 = performance.now();
      // API/infra errors propagate and abort the whole run: they are not agent failures.
      const r = await runOutfitAgent(
        { request: c.request, ...(c.location ? { location: c.location } : {}) },
        { db: pool, weather: EVAL_WEATHER, now: () => EVAL_NOW, effort, createMessage: (p) => anthropic.beta.messages.create(p) },
      );
      const latencyMs = performance.now() - t0;
      const checks = gradeRun(c, r, lookup);
      runs[idx] = {
        caseId: c.id, tags: c.tags, repeat, checks, iterations: r.iterations, latencyMs,
        costUsd: estimateCostUsd(r.usage),
        detail: {
          status: r.status,
          outfit: r.outfit && {
            items: r.outfit.items.map((i) => `${i.category}: ${i.name}`),
            temperatureF: r.outfit.temperatureF,
            targetFormality: r.outfit.targetFormality,
            explanation: r.outfit.explanation,
            warnings: r.outfit.warnings.map((w) => w.rule),
          },
          usage: r.usage,
          models: r.models,
          trace: r.trace,
        },
      };
      process.stdout.write(`\r  ${++done}/${tasks.length}`);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(Number(args.concurrency), tasks.length) }, worker));
  } catch (err) {
    fail(`\nRun aborted (not an agent failure): ${(err as Error).message}`);
  }
  console.log("\n");

  const summary = summarize(runs);
  const failures = runs.flatMap((r) =>
    r.checks.filter((c) => c.passed === false).map((c) => ({
      caseId: repeats > 1 ? `${r.caseId}#${r.repeat + 1}` : r.caseId, check: c.check, detail: c.detail,
    })),
  );
  console.log(formatSummary(summary, failures));

  mkdirSync(args.out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(args.out, `outfits-${stamp}-${effort}-x${repeats}.json`);
  writeFileSync(outFile, JSON.stringify({
    model: MODEL, effort, repeats, agentVersion: AGENT_VERSION, ranAt: new Date().toISOString(),
    filters: { only: args.only ?? null, case: args.case ?? null },
    summary, failures, runs,
  }, null, 2));
  console.log(`\nSaved ${outFile}`);
} finally {
  await pool.end();
}
