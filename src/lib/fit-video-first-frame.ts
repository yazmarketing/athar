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
  fitWithinPixelLimit,
  parseAspect,
  readRasterSize,
} from "@/lib/crop-to-aspect";

const execFileAsync = promisify(execFile);

function parseVideoSize(stderr: string): { width: number; height: number } | null {
  const m = stderr.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

function ffmpegBin(): string | null {
  return ffmpegStatic || null;
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
  return centerCropToAspectRange(srcW, srcH, ASSET_MIN_AR, ASSET_MAX_AR);
}

function extFor(bytes: Uint8Array): "jpg" | "png" | "webp" {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
  ) {
    return "webp";
  }
  return "jpg";
}

/**
 * Center-crop a still so Seedance will accept it, then re-upload.
 * Reads JPEG/PNG headers when ffmpeg cannot probe, and never sends an
 * out-of-range original through "just in case".
 */
export async function publishFittedFrameImage(
  sourceUrl: string,
  aspect: string,
  firstFrame = true
): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Could not read the attached image (${res.status})`);
  }
  const input = Buffer.from(await res.arrayBuffer());
  const headerSize = readRasterSize(input);
  const bin = ffmpegBin();

  let probed: { width: number; height: number } | null = headerSize;
  const dir = await mkdtemp(join(tmpdir(), "athar-frame-"));
  const srcPath = join(dir, `in.${extFor(input)}`);
  const outPath = join(dir, "out.jpg");
  try {
    await writeFile(srcPath, input);
    if (bin) {
      let probe = "";
      try {
        const ran = await execFileAsync(bin, ["-hide_banner", "-i", srcPath], {
          timeout: 20_000,
          maxBuffer: 2_000_000,
        });
        probe = String(ran.stderr ?? "");
      } catch (err) {
        probe =
          err && typeof err === "object" && "stderr" in err
            ? String((err as { stderr: unknown }).stderr ?? "")
            : "";
      }
      probed = parseVideoSize(probe) ?? probed;
    }

    if (!probed) {
      throw new Error(
        "Could not read the attached still's size, so it was not sent to Seedance"
      );
    }
    const crop = cropForImage(probed.width, probed.height, aspect, firstFrame);
    const frameW = crop?.width ?? probed.width;
    const frameH = crop?.height ?? probed.height;
    const scaled = fitWithinPixelLimit(frameW, frameH);
    if (!crop && !scaled) return sourceUrl;
    if (!bin) {
      throw new Error(
        scaled
          ? `Attached still is ${probed.width}×${probed.height}. Seedance allows at most 36,000,000 pixels.`
          : `Attached still is ${probed.width}×${probed.height} (aspect ${(probed.width / probed.height).toFixed(2)}). Seedance only accepts 0.39–2.50.`
      );
    }
    const filters = [
      crop
        ? `crop=${crop.width}:${crop.height}:(in_w-${crop.width})/2:(in_h-${crop.height})/2`
        : null,
      scaled ? `scale=${scaled.width}:${scaled.height}` : null,
    ].filter(Boolean);

    await execFileAsync(
      bin,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        srcPath,
        "-vf",
        filters.join(","),
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
 * Any still over 36,000,000 pixels is scaled down before Seedance sees it.
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
