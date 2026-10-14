import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { extractAttributes } from "./extraction/extract.js";

const app = createApp({
  db: pool,
  extractor: (photo) => extractAttributes(photo),
  uploadDir: env.UPLOAD_DIR,
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
