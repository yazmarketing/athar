import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { uploadPublicObject } from "@/lib/storage";
import type { ArkVideoRequest } from "@/lib/byteplus-server";
import {
  centerCropForAspect,
  parseAspect,
} from "@/lib/crop-to-aspect";

const execFileAsync = promisify(execFile);

function parseVideoSize(stderr: string): { width: number; height: number } | null {
  const m = stderr.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

function isFirstFrameRequest(req: ArkVideoRequest): boolean {
  const images = req.imageUrls ?? [];
  return (
    !(req.videoUrls?.length) &&
    !(req.referenceVideoUrls?.length) &&
    !(req.audioUrls?.length) &&
    images.length === 1 &&
    !images[0].startsWith("asset://")
  );
}

/**
 * Center-crop a still so it matches `aspect` (e.g. "16:9"), then re-upload.
 * No-op when ffmpeg is missing or the source is already that ratio.
 */
export async function publishFittedFrameImage(
  sourceUrl: string,
  aspect: string
): Promise<string> {
  const parsed = parseAspect(aspect);
  if (!parsed || !ffmpegStatic) return sourceUrl;

  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Could not read the first-frame image (${res.status})`);
  }
  const input = Buffer.from(await res.arrayBuffer());
  const dir = await mkdtemp(join(tmpdir(), "athar-frame-"));
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
    const crop = centerCropForAspect(size.width, size.height, parsed.w, parsed.h);
    if (!crop) return sourceUrl;

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
        `crop=${crop.width}:${crop.height}:(in_w-${crop.width})/2:(in_h-${crop.height})/2`,
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
    const path = `frames/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    return uploadPublicObject(path, copy as ArrayBuffer, "image/jpeg");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * First-frame Seedance tasks inherit the still's aspect. Crop a 21:9 (or
 * other) still to the requested ratio before submit so the clip is 16:9
 * when the dock says 16:9.
 */
export async function fitVideoRequestFirstFrame(
  req: ArkVideoRequest
): Promise<ArkVideoRequest> {
  if (!isFirstFrameRequest(req)) return req;
  const source = req.imageUrls![0];
  const fitted = await publishFittedFrameImage(source, req.ratio);
  if (fitted === source) return req;
  return { ...req, imageUrls: [fitted] };
}
