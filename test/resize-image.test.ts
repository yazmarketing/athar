import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { resizeImage } from "@/lib/resize-image";

describe("non-generative resize", () => {
  it.each([2, 4] as const)("scales both dimensions by %s and retains transparency and colour", async scale => {
    const source = await sharp({ create: { width: 8, height: 4, channels: 4, background: { r: 80, g: 120, b: 180, alpha: 0.5 } } }).png().toBuffer();
    const result = await resizeImage(source, scale);
    expect(result.width).toBe(8 * scale);
    expect(result.height).toBe(4 * scale);
    const metadata = await sharp(result.data).metadata();
    expect(metadata.hasAlpha).toBe(true);
    const { data } = await sharp(result.data).raw().toBuffer({ resolveWithObject: true });
    const original = await sharp(source).raw().toBuffer();
    // Alpha premultiplication during interpolation can round RGB by one level.
    for (let i = 0; i < 3; i++) expect(Math.abs(data[i] - original[i])).toBeLessThanOrEqual(1);
    expect(data[3]).toBe(original[3]);
  });
  it("rejects an oversized output before allocating it", async () => {
    const source = await sharp({ create: { width: 2400, height: 2400, channels: 3, background: "white" } }).png().toBuffer();
    await expect(resizeImage(source, 4)).rejects.toThrow("64 megapixels");
  });
  it("rejects undecodable input", async () => {
    await expect(resizeImage(Buffer.from("not an image"), 2)).rejects.toThrow();
  });
});
