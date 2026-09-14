import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { uploadPublicObject } from "@/lib/storage";
import { fitAssetSize } from "@/lib/byteplus-asset-size";

const execFileAsync = promisify(execFile);

function parseVideoSize(stderr: string): { width: number; height: number } | null {
  const m = stderr.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

/**
 * Fetch a registered-face photo and rewrite it so CreateAsset will accept it.
 * Camera collages are often taller than BytePlus allows ("Height must be
 * between 300 and …") — scale and center-crop, then re-upload.
 */
export async function publishFittedAssetImage(sourceUrl: string): Promise<string> {
  if (!ffmpegStatic) return sourceUrl;

  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Could not read the photo for BytePlus (${res.status})`);
  }
  const input = Buffer.from(await res.arrayBuffer());
  const dir = await mkdtemp(join(tmpdir(), "athar-asset-"));
  const srcPath = join(dir, "in.jpg");
  const outPath = join(dir, "out.jpg");
  try {
    await writeFile(srcPath, input);
    let probe = "";
    try {
      const ran = await execFileAsync(
        ffmpegStatic,
        ["-hide_banner", "-i", srcPath],
        { timeout: 20_000, maxBuffer: 2_000_000 }
      );
      probe = String(ran.stderr ?? "");
    } catch (err) {
      probe =
        err && typeof err === "object" && "stderr" in err
          ? String((err as { stderr: unknown }).stderr ?? "")
          : "";
    }
    const size = parseVideoSize(probe);
    if (!size) return sourceUrl;
    const target = fitAssetSize(size.width, size.height);
    if (target.width === size.width && target.height === size.height) {
      return sourceUrl;
    }

    await execFileAsync(
      ffmpegStatic,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        srcPath,
        "-vf",
        `scale=${target.width}:${target.height}:force_original_aspect_ratio=increase,crop=${target.width}:${target.height}`,
        "-q:v",
        "3",
        outPath,
      ],
      { timeout: 60_000, maxBuffer: 2_000_000 }
    );
    const out = await readFile(outPath);
    const bytes = new Uint8Array(out);
    const copy = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    );
    const path = `references/asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    return uploadPublicObject(path, copy as ArrayBuffer, "image/jpeg");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
