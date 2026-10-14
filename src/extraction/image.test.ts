import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { makePng } from "../../test/helpers.js";
import { ExtractionError } from "./errors.js";
import { prepareImage } from "./image.js";

describe("prepareImage", () => {
  it("downsizes to 1568px on the long edge and outputs JPEG", async () => {
    const out = await prepareImage(await makePng(4000, 3000));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([1568, 1176]);
  });

  it("does not upscale small images", async () => {
    const meta = await sharp(await prepareImage(await makePng(300, 200))).metadata();
    expect([meta.width, meta.height]).toEqual([300, 200]);
  });

  it("strips EXIF metadata (e.g. GPS)", async () => {
    const withExif = await sharp(await makePng(50, 50))
      .withMetadata({ exif: { IFD0: { Copyright: "secret location" } } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    expect((await sharp(await prepareImage(withExif)).metadata()).exif).toBeUndefined();
  });

  it("rejects non-images as unsupported_image", async () => {
    await expect(prepareImage(Buffer.from("not an image"))).rejects.toMatchObject({
      constructor: ExtractionError,
      code: "unsupported_image",
    });
  });
});
