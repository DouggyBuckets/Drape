import Anthropic from "@anthropic-ai/sdk";
import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ExtractionError } from "./extraction/errors.js";
import { LimitError } from "./limits/limits.js";

const EXTRACTION_STATUS = { unsupported_image: 415, refused: 422, invalid_output: 502 } as const;

/** Maps known failures to HTTP responses. Express 5 forwards rejected async handlers here. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ExtractionError) {
    res.status(EXTRACTION_STATUS[err.code]).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof LimitError) {
    res.status(429).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({ error: err.code.toLowerCase(), message: err.message });
    return;
  }
  if (err instanceof Anthropic.APIError) {
    console.error(`Anthropic API error ${err.status}:`, err.message);
    const status = err.status === 429 || err.status === 529 ? 503 : 502;
    res.status(status).json({ error: "upstream_error", message: "The vision model request failed." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error" });
};
