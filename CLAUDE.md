# Drape

Wardrobe-based outfit-building agent. Users photograph clothing items, a vision LLM extracts
structured attributes, and an agent builds outfits using only items in that wardrobe
(e.g. "dinner, 45 degrees, smart casual").

## Goals
- Learn: LLM tool use, vision with structured output, agent loops, evaluation.
- Ship: deployed demo, public GitHub repo, README with an evaluation section.
- Finish: small stages, each working end to end before the next starts.

## Stages
1. Scaffold — Docker Postgres, fail-fast env, migrations, `/health`.
2. Item extraction — photo → validated JSON (type, color, formality, warmth, season) → `wardrobe_items`; accuracy script vs hand-labeled CSV.
3. Outfit agent — tools `search_wardrobe`, `get_weather`, `check_outfit_rules`; hand-written loop with an iteration cap; returned item IDs must exist (enforced in code).
4. Evaluation — every item exists, one item per slot, warmth fits weather, formality fits occasion; pass rates over test requests.
5. Frontend (later).

## Stack
TypeScript, Node.js, Express, PostgreSQL (Docker Compose), Zod, numbered SQL migrations,
official Anthropic TypeScript SDK (`@anthropic-ai/sdk`). Model: `claude-opus-5-5`.
Use "drape" for the repo, package, and database names.

## Conventions
- One stage at a time; don't start the next until the current one works end to end.
- Explain design decisions and tradeoffs before implementing; call out interview-worthy concepts.
- Small commits with clear conventional messages (`feat:`, `chore:`, `fix:`, `test:`, `docs:`).
- Never commit API keys or personal photos. `.env`, `images/`, `uploads/` are gitignored. Item photos are stored in Postgres (`wardrobe_items.image`), so never commit database dumps either.
- All env config goes through `src/config/env.ts` (Zod, fails fast). Don't read `process.env` elsewhere.
- Schema changes are new numbered files in `migrations/` (`NNN_description.sql`); never edit an applied migration.
- Check current Anthropic docs for API shapes rather than relying on memory.
- Attribute vocabularies and level definitions live only in `src/extraction/rubric.ts`; the prompt and labeling guide are generated from it. Changing allowed values also needs a new migration for the `wardrobe_items` CHECK constraints.
- Tests never call the real API: inject a fake `Extractor`/`runAgent` via `createApp` deps, or a scripted `createMessage` into the agent loop.
- Agent loop history is append-only: push `response.content` back unchanged (thinking blocks included); all tool results for one turn go in a single user message.
- Outfit eval grades against each case's EXPECTED temperature/formality, never the agent's own claims. After any prompt/tool change, re-run the full set (not just the case you fixed) to catch regressions.
- Outfit rules live in `src/outfit/rules.ts` and are shared by the agent tools and evals. Structure rules are hard (submit rejects); fit rules are warnings.
- Evals: only `ExtractionError`s count as model failures; other errors abort the run.
- Eval labels: `eval/labels.csv` is the held-out test set (report only these); `eval/labels.dev.csv` is for tuning. Never fill labels from model output. Don't tune the rubric against test-set results.

## Commands
- `npm run db:up` — start Postgres (host port 5433)
- `npm run migrate` — apply pending migrations
- `npm run dev` — run the server with reload
- `npm test` — run tests (uses a separate `drape_test` database, created automatically)
- `npm run seed` — load the fixture wardrobe into the dev DB (`-- --reset` removes it; real items untouched)
- `npm run eval:extraction` — extraction accuracy vs `eval/labels.csv` (calls the API; costs money)
- `npm run eval:outfits -- --repeats 3` — outfit agent eval in a separate `drape_eval` DB (≈$2.50 for 3 repeats; use 1 while iterating, 3 for reported numbers)
- `npm run labeling-guide` — regenerate `eval/LABELING.md` after editing `src/extraction/rubric.ts`
