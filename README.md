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
