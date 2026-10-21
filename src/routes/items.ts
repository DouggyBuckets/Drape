import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireUser } from "../auth/middleware.js";
import multer from "multer";
import { z } from "zod";
import type { Queryable } from "../db/pool.js";
import type { Extractor } from "../extraction/extract.js";
import { getItem, getItemImage, insertItem, listItems } from "../items/repository.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

export function itemsRouter(deps: { db: Queryable; extractor: Extractor }): Router {
  const router = Router();
  // req.user is guaranteed by requireUser on every route below.
  router.use("/items", requireUser);

  router.post("/items", upload.single("image"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "missing_image", message: "Send a photo as multipart field 'image'." });
      return;
    }

    const result = await deps.extractor(req.file.buffer);
    // Stores the normalized JPEG (metadata already stripped), not the original upload,
    // in the same row as its attributes, so there's no file to orphan if the insert fails.
    const item = await insertItem(deps.db, req.user!.id, {
      id: randomUUID(),
      attributes: result.attributes,
      image: result.image,
      model: result.model,
      extraction: { attributes: result.attributes, usage: result.usage },
    });
    res.status(201).json(item);
  });

  router.get("/items", async (req, res) => {
    res.json(await listItems(deps.db, req.user!.id));
  });

  router.get("/items/:id", async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    const item = id.success ? await getItem(deps.db, req.user!.id, id.data) : null;
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(item);
  });

  router.get("/items/:id/image", async (req, res) => {
    const image = await getItemImage(deps.db, req.user!.id, req.params.id);
    if (!image) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    // An item's image never changes, so the browser may cache it indefinitely. "private":
    // it's per-user content, so shared caches (CDNs, proxies) must not store it.
    res.set("Cache-Control", "private, max-age=31536000, immutable").type("image/jpeg").send(image);
  });

  return router;
}
