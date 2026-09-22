import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { uploadPublicObject } from "@/lib/storage";
import type { ArkVideoRequest } from "@/lib/byteplus-server";
import { ASSET_MAX_AR, ASSET_MIN_AR } from "@/lib/byteplus-asset-size";
import {
  centerCropForAspect,
  centerCropToAspectRange,
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

function cropForImage(
  srcW: number,
  srcH: number,
  ratio: string,
  firstFrame: boolean
): { width: number; height: number } | null {
  if (firstFrame) {
    const parsed = parseAspect(ratio);
    if (parsed) {
      const dock = centerCropForAspect(srcW, srcH, parsed.w, parsed.h);
      if (dock) return dock;
    }
  }
  // Reference stills keep their own frame, but Seedance 2.5 rejects anything
  // outside 0.39–2.50 (the 3.30 panoramic / EXIF-unrotated phone photo).
  return centerCropToAspectRange(srcW, srcH, ASSET_MIN_AR, ASSET_MAX_AR);
}

/**
 * Center-crop a still so Seedance will accept it, then re-upload.
 * No-op when ffmpeg is missing or the source is already in range.
 */
export async function publishFittedFrameImage(
  sourceUrl: string,
  aspect: string,
  firstFrame = true
): Promise<string> {
  if (!ffmpegStatic) return sourceUrl;

  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Could not read the attached image (${res.status})`);
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
    const crop = cropForImage(size.width, size.height, aspect, firstFrame);
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
 * Make every attached still legal for Seedance before submit.
 *
 * One image (first frame) is cropped to the dock ratio, because output
 * follows that still. Several images are references: keep their frame, but
 * clamp anything outside 0.39–2.50 so ModelArk does not reject the download.
 */
export async function fitVideoRequestFirstFrame(
  req: ArkVideoRequest
): Promise<ArkVideoRequest> {
  const images = req.imageUrls ?? [];
  if (!images.length) return req;
  const firstFrame = isFirstFrameRequest(req);
  const fitted = await Promise.all(
    images.map((url) =>
      url.startsWith("asset://")
        ? url
        : publishFittedFrameImage(url, req.ratio, firstFrame)
    )
  );
  if (fitted.every((url, i) => url === images[i])) return req;
  return { ...req, imageUrls: fitted };
}
