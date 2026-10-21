import { runOutfitAgent } from "./agent/loop.js";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { extractAttributes } from "./extraction/extract.js";
import { anthropic } from "./llm/client.js";
import { openMeteo } from "./weather/weather.js";

const app = createApp({
  db: pool,
  secureCookies: env.NODE_ENV === "production",
  extractor: (photo) => extractAttributes(photo),
  runAgent: (req, userId) =>
    runOutfitAgent(req, {
      db: pool,
      userId,
      weather: openMeteo,
      createMessage: (params) => anthropic.beta.messages.create(params),
    }),
});

const server = app.listen(env.PORT, () => {
  console.log(`drape listening on http://localhost:${env.PORT}`);
});

function shutdown() {
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
