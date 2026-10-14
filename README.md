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

## Evaluation

### Attribute extraction

`npm run eval:extraction` compares model output to hand labels in `eval/labels.csv`
(see [eval/LABELING.md](eval/LABELING.md)) and reports accuracy per attribute.
Options: `--effort low|medium|high`, `--limit N`, `--concurrency N`.

_Results: pending first labeled run._
