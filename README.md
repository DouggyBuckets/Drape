# Drape
Drape is a wardrobe-based outfit-building agent. Users photograph clothing items, a vision-capable LLM extracts structured attributes, and an agent builds outfits using only the items in that wardrobe, given a request like "dinner, 45 degrees, smart casual."

## Getting started

Requires Node 22+ and Docker.

```bash
cp .env.example .env        # then set ANTHROPIC_API_KEY
npm install
npm run db:up               # Postgres on localhost:5433
npm run migrate
npm run dev                 # http://localhost:3000/health
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
npm run seed                 # optional: load a 33-item fixture wardrobe (removable with -- --reset)
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

## Evaluation

### Attribute extraction

`npm run eval:extraction` compares model output to hand labels and reports accuracy per
attribute (see [eval/LABELING.md](eval/LABELING.md)). Labels are split into a held-out
**test set** (`eval/labels.csv`, the only numbers reported here) and a **dev set**
(`eval/labels.dev.csv`, used for rubric and prompt changes).
Options: `--labels FILE`, `--effort low|medium|high`, `--limit N`, `--concurrency N`.
Each run is saved to `eval/results/` with the model, effort, prompt version hash and labels file.

_Results: pending first labeled run._
