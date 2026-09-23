import "server-only";
import sharp from "sharp";

const MAX_BYTES = 25_000_000;
const MAX_PIXELS = 64_000_000;

/** Resamples existing pixels; does not invent texture, faces, lettering or objects. */
export async function resizeImage(bytes: Buffer, scale: 2 | 4) {
  if (bytes.byteLength > MAX_BYTES) throw new Error("Image exceeds the 25 MB resize limit.");
  const image = sharp(bytes, { limitInputPixels: MAX_PIXELS });
  const meta = await image.metadata();
  if (!meta.width || !meta.height || (meta.pages ?? 1) > 1) {
    throw new Error("Choose a single still image to resize.");
  }
  const rotated = meta.orientation != null && meta.orientation >= 5;
  const width = (rotated ? meta.height : meta.width) * scale;
  const height = (rotated ? meta.width : meta.height) * scale;
  if (width * height > MAX_PIXELS || Math.max(width, height) > 16_384) {
    throw new Error("The resized image would be too large (64 megapixels maximum). Choose a smaller scale or source.");
  }
  const data = await image.rotate().resize(width, height, { kernel: "lanczos3" }).png().toBuffer();
  return { data, width, height };
}

export async function fetchResizeSource(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error("Could not load the source image. Re-upload it and try again.");
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Image exceeds the 25 MB resize limit.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new Error("Image exceeds the 25 MB resize limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
