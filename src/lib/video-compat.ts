import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = promisify(execFile);

/** Probe / convert budget — a 5s 1080p clip should finish well under this. */
const FFMPEG_TIMEOUT_MS = 180_000;

/**
 * Whether ffmpeg's `-i` dump describes a clip Chrome, Safari and Edge can
 * paint. HEVC/H.265, 10-bit and 4:4:4 often play audio (and advance time)
 * while the picture stays black — which is what one Athar user hit.
 */
export function videoStreamLooksBrowserSafe(ffmpegStderr: string): boolean {
  const videoLine = ffmpegStderr
    .split(/\r?\n/)
    .find((line) => /Stream #.*Video:/i.test(line));
  if (!videoLine) return false;

  const codec = /Video:\s*([a-z0-9]+)/i.exec(videoLine)?.[1]?.toLowerCase();
  if (codec !== "h264" && codec !== "avc1") return false;
  if (/10\b|yuv444|yuv422|gbrp|p10/i.test(videoLine)) return false;
  return /yuv420p/i.test(videoLine);
}

export function streamHasAudio(ffmpegStderr: string): boolean {
  return /Stream #.*Audio:/i.test(ffmpegStderr);
}

function ffmpegBin(): string {
  if (!ffmpegStatic) {
    throw new Error("ffmpeg-static did not ship a binary for this platform");
  }
  return ffmpegStatic;
}

async function probeStderr(inputPath: string): Promise<string> {
  try {
    const { stderr } = await execFileAsync(
      ffmpegBin(),
      ["-hide_banner", "-i", inputPath],
      { timeout: 30_000, maxBuffer: 2_000_000 }
    );
    return String(stderr ?? "");
  } catch (err) {
    // `ffmpeg -i` always exits non-zero; the useful dump is on stderr.
    const stderr =
      err && typeof err === "object" && "stderr" in err
        ? String((err as { stderr: unknown }).stderr ?? "")
        : "";
    if (stderr) return stderr;
    throw err;
  }
}

/**
 * Return an H.264/yuv420p MP4 at the same resolution as the source.
 *
 * Already-safe clips are returned unchanged (no extra generation loss).
 * Anything else is re-encoded at CRF 14 — visually lossless for short
 * Seedance clips — with no scale filter. If ffmpeg is missing or fails,
 * the original bytes are kept so the render still lands in the Library.
 */
export async function ensureBrowserMp4(
  input: ArrayBuffer
): Promise<ArrayBuffer> {
  let bin: string;
  try {
    bin = ffmpegBin();
  } catch {
    return input;
  }

  const dir = await mkdtemp(join(tmpdir(), "athar-mp4-"));
  const srcPath = join(dir, "in.mp4");
  const outPath = join(dir, "out.mp4");
  try {
    await writeFile(srcPath, Buffer.from(input));
    const probe = await probeStderr(srcPath);
    if (videoStreamLooksBrowserSafe(probe)) return input;

    const audio = streamHasAudio(probe);
    await execFileAsync(
      bin,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        srcPath,
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "14",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-movflags",
        "+faststart",
        ...(audio ? ["-c:a", "aac", "-b:a", "320k"] : ["-an"]),
        outPath,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 2_000_000 }
    );
    const out = await readFile(outPath);
    return out.buffer.slice(
      out.byteOffset,
      out.byteOffset + out.byteLength
    ) as ArrayBuffer;
  } catch {
    return input;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
