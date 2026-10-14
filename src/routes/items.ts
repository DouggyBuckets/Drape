import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Queryable } from "../db/pool.js";
import type { Extractor } from "../extraction/extract.js";
import { getItem, insertItem, listItems } from "../items/repository.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

export function itemsRouter(deps: { db: Queryable; extractor: Extractor; uploadDir: string }): Router {
  const router = Router();

  router.post("/items", upload.single("image"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "missing_image", message: "Send a photo as multipart field 'image'." });
      return;
    }

    const result = await deps.extractor(req.file.buffer);

    // Store the normalized JPEG (metadata already stripped), not the original upload.
    const id = randomUUID();
    await mkdir(deps.uploadDir, { recursive: true });
    const imagePath = path.join(deps.uploadDir, `${id}.jpg`);
    await writeFile(imagePath, result.image);

    try {
      const item = await insertItem(deps.db, {
        id,
        attributes: result.attributes,
        imagePath,
        model: result.model,
        extraction: { attributes: result.attributes, usage: result.usage },
      });
      res.status(201).json(item);
    } catch (err) {
      await rm(imagePath, { force: true }); // don't leave orphaned files
      throw err;
    }
  });

  router.get("/items", async (_req, res) => {
    res.json(await listItems(deps.db));
  });

  router.get("/items/:id", async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    const item = id.success ? await getItem(deps.db, id.data) : null;
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(item);
  });

  return router;
}
