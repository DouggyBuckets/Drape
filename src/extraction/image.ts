import sharp from "sharp";
import { ExtractionError } from "./errors.js";

// Image tokens scale with pixel area (~w*h/750). 1568px on the long edge is plenty
// to judge a garment and keeps each request around 3k input tokens.
const MAX_EDGE = 1568;

/**
 * Normalizes an uploaded photo for the model: applies EXIF rotation, downsizes,
 * re-encodes as JPEG, and drops all metadata (including GPS location).
 */
export async function prepareImage(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (err) {
    throw new ExtractionError(
      "unsupported_image",
      "Could not read image. Use JPEG, PNG, WebP or GIF (iPhone HEIC: export as JPEG).",
      { cause: err },
    );
  }
}
