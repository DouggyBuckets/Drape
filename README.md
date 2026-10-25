# Drape

**Live demo: [drape.fly.dev](https://drape.fly.dev)** (click *Try the demo*, no account needed)
Drape is a wardrobe-based outfit-building agent. Users photograph clothing items, a vision-capable LLM extracts structured attributes, and an agent builds outfits using only the items in that wardrobe, given a request like "dinner, 45 degrees, smart casual."

## Getting started

Requires Node 22+ and Docker.

```bash
cp .env.example .env        # then set ANTHROPIC_API_KEY
npm install && npm --prefix web install
npm run db:up               # Postgres on localhost:5433
npm run migrate
npm run dev:all             # API on :3000 + UI on http://localhost:5173
npm test                    # needs the database running
```

## Adding wardrobe items

```bash
curl -F image=@images/navy-coat.jpg localhost:3000/items   # extract + store
curl localhost:3000/items                                  # list
```

Photos must be JPEG, PNG, WebP or GIF (iPhone: set Camera → Formats → Most Compatible).
They are rotated, resized to 1568px, and stripped of metadata before being sent or stored.

## Building outfits

```bash
npm run create-user -- --email you@example.com      # create an account (or POST /auth/signup)
npm run seed -- --email you@example.com             # optional: 33-item fixture wardrobe (-- --reset removes it)
curl -H 'content-type: application/json' \
  -d '{"request":"dinner, 45 degrees, smart casual"}' localhost:3000/outfits
curl -H 'content-type: application/json' \
  -d '{"request":"job interview tomorrow morning","location":"Chicago"}' localhost:3000/outfits
```

The agent is a hand-written tool-use loop (capped at 8 model calls) with four tools:
`search_wardrobe`, `get_weather` (Open-Meteo), `check_outfit_rules`, and `submit_outfit`.
`submit_outfit` rejects item ids that don't exist and invalid slot combinations, so the agent
can only return real items; warmth and formality problems come back as warnings. The response
includes the outfit, token usage, and a trace of every tool call.
`POST /outfits/stream` returns the same result as server-sent events, one `step` per tool call
as it happens, then `result`. The web UI uses it for live progress; if the client disconnects,
the agent run is cancelled so no further tokens are spent.

## Deployment

Runs on [Fly.io](https://fly.io) (one always-on machine) with a [Neon](https://neon.tech) Postgres database.

```bash
fly secrets set -a drape DATABASE_URL='<neon direct url>' ANTHROPIC_API_KEY='<production key>'
fly deploy                     # builds the Dockerfile; migrations run as the release command
DATABASE_URL='<neon url>' npm run create-user -- --email you@example.com --demo   # demo account
```

Use Neon's **direct** connection string (not the pooled one): the migration runner takes a
session-level advisory lock, which a transaction-mode pooler doesn't preserve. Production uses a
separate Anthropic key with a Console spend limit, on top of the app's own daily spend cap.

## Evaluation

### Outfit agent

`npm run eval:outfits -- --repeats 3` runs 18 test requests ([eval/outfit-cases.json](eval/outfit-cases.json))
against a fixed 33-item fixture wardrobe, fixed weather and a fixed date, three times each.
Every run is graded by deterministic checks:

| Check | What it verifies |
|---|---|
| `completed` | The agent submitted an outfit within the 8-call cap |
| `items_exist` | Every item id exists (independent database lookup, not the agent's own output) |
| `one_per_slot` | Top + bottom or a dress, one pair of shoes, ≤1 outerwear, ≤3 accessories, no duplicates |
| `warmth_fits` | Warmth fits the case's **expected** temperature, not the temperature the agent claims |
| `formality_fits` | Every clothing item is within ±1 of the case's **expected** formality range |
| `understood_temperature` | The temperature the agent planned for is in the expected range |
| `understood_formality` | The formality the agent planned for is in the expected range |
| `weather_tool_use` | `get_weather` is called if and only if the request doesn't state a temperature |

A unit test brute-forces the fixture wardrobe to confirm every case is satisfiable.

**Results** (`claude-opus-5-5`, effort `medium`, 54 runs per row):

| Agent version | All checks pass | Your four core checks | Failures | Mean calls | Mean latency | Cost |
|---|---|---|---|---|---|---|
| Baseline | 94% (51/54) | 100% | morning case: used the daily high (30°F) instead of the morning low, 3/3 runs | 3.4 | 15.5s | $2.45 |
| Time-of-day prompt fix | **100% (54/54)** | 100% | none | 3.3 | 14.8s | $2.42 |

**What changed:** the prompt said "use the high for daytime plans, the low for evening plans",
which left mornings ambiguous. The agent consistently read "interview tomorrow morning" as daytime.
The fix maps early morning, evening and night to the daily low. The whole suite was re-run to
check that nothing else got worse.

**Limitations:**
- **Near ceiling.** The ±1 tolerance and a flexible fixture wardrobe make these cases easy to
  pass. This set catches regressions but can't separate a good agent from a great one. Harder
  cases (tighter wardrobes, conflicting constraints) are future work.
- **The checks don't measure style.** Color harmony and whether items look good together aren't
  graded; that would need an LLM-as-judge checked against human ratings.
- **The baseline's misreading didn't change the outfit:** 15°F and 30°F map to the same warmth
  level, so `warmth_fits` passed either way.

### Attribute extraction

`npm run eval:extraction` compares model output to hand labels and reports accuracy per
attribute (see [eval/LABELING.md](eval/LABELING.md)). Labels are split into a held-out
**test set** (`eval/labels.csv`, the only numbers reported here) and a **dev set**
(`eval/labels.dev.csv`, used for rubric and prompt changes).
Options: `--labels FILE`, `--effort low|medium|high`, `--limit N`, `--concurrency N`.
Each run is saved to `eval/results/` with the model, effort, prompt version hash and labels file.

_Results: pending a labeled test set. On the 5-item dev set, category, color and formality are
100% after fixing the rubric; warmth is 40% exact (100% within ±1), with the labeler consistently
rating one level warmer than the model._
