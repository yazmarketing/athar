import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";
import type { DirectorAsset } from "../director-types";
import { assertIdle, DirectorError, filePath, MAX_ASSETS, MAX_UPLOAD_BYTES, projectPath, requireOwner, withRecord } from "./store";

export function runFfmpeg(args: string[], opts: { signal?: AbortSignal; timeout?: number; onLine?: (line: string) => void } = {}): Promise<string> {
  const binary = ffmpeg;
  if (!binary) return Promise.reject(new DirectorError("Video rendering is unavailable on this server", 503));
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"], signal: opts.signal });
    let tail = ""; let done = false;
    const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeout ?? 10 * 60_000);
    child.stderr.on("data", (b) => { const s = b.toString(); tail = (tail + s).slice(-24000); opts.onLine?.(s); });
    child.once("error", (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } });
    child.once("close", (code) => { if (!done) { done = true; clearTimeout(timer); if (code === 0) resolve(tail); else reject(Object.assign(new Error(`Media processing failed (${code}): ${tail.slice(-1800)}`), { stderr: tail })); } });
  });
}
export async function probeMedia(path: string, signal?: AbortSignal) {
  let output = "";
  try { output = await runFfmpeg(["-hide_banner", "-i", path], { signal, timeout: 30000 }); }
  catch (error) {
    if (signal?.aborted) throw error;
    // FFmpeg exits nonzero when probing without an output. Only that case
    // has stderr to parse; spawn failures must not masquerade as bad media.
    const stderr = (error as { stderr?: string }).stderr;
    if (typeof stderr !== "string") throw new DirectorError("The media decoder could not start on the server. Please contact your administrator.", 503);
    output = stderr;
  }
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(output);
  const video = output.split("\n").find((l) => /Stream #.*Video:/.test(l));
  const size = video ? /\b(\d{2,5})x(\d{2,5})\b/.exec(video) : null;
  return { duration: match ? +match[1] * 3600 + +match[2] * 60 + +match[3] : 0, width: size ? +size[1] : 0, height: size ? +size[2] : 0, hasVideo: !!video, hasAudio: /Stream #.*Audio:/.test(output), codec: video ? /Video:\s*([^ ,]+)/.exec(video)?.[1] : undefined };
}
const TYPES: Record<string, { kind: DirectorAsset["kind"]; ext: string }> = {
  "image/jpeg": { kind: "image", ext: "jpg" }, "image/png": { kind: "image", ext: "png" }, "image/webp": { kind: "image", ext: "webp" },
  "video/mp4": { kind: "video", ext: "mp4" }, "video/quicktime": { kind: "video", ext: "mov" }, "video/webm": { kind: "video", ext: "webm" },
  "video/x-matroska": { kind: "video", ext: "mkv" },
  "audio/mpeg": { kind: "audio", ext: "mp3" }, "audio/mp3": { kind: "audio", ext: "mp3" }, "audio/wav": { kind: "audio", ext: "wav" }, "audio/x-wav": { kind: "audio", ext: "wav" }, "audio/mp4": { kind: "audio", ext: "m4a" }, "audio/aac": { kind: "audio", ext: "aac" }, "audio/ogg": { kind: "audio", ext: "ogg" },
};
export function directorMediaType(type: string, name: string) {
  const mime = type.toLowerCase().split(";")[0];
  if (mime === "audio/x-m4a") return "audio/mp4";
  if (TYPES[mime]) return mime;
  if (mime && mime !== "application/octet-stream") return mime;
  const byExtension: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg" };
  return byExtension[name.split(".").pop()?.toLowerCase() || ""] || mime;
}
function containerSignature(bytes: Buffer, ext: string) {
  const start = bytes.subarray(0, 16);
  if (["mp4", "mov", "m4a"].includes(ext)) return /^(ftyp|moov|mdat|wide|skip)$/.test(start.toString("ascii", 4, 8));
  if (["webm", "mkv"].includes(ext)) return start.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (ext === "wav") return start.toString("ascii", 0, 4) === "RIFF" && start.toString("ascii", 8, 12) === "WAVE";
  if (ext === "mp3") return start.toString("ascii", 0, 3) === "ID3" || (start[0] === 0xff && (start[1] & 0xe0) === 0xe0);
  if (ext === "aac") return start[0] === 0xff && (start[1] & 0xf0) === 0xf0;
  if (ext === "ogg") return start.toString("ascii", 0, 4) === "OggS";
  return true;
}
export async function addAsset(id: string, ownerId: string, file: File) {
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new DirectorError("Each file must be between 1 byte and 100 MB", 413);
  const mime = directorMediaType(file.type, file.name);
  const spec = TYPES[mime];
  if (!spec) throw new DirectorError("Use JPEG, PNG, WebP, MP4, MOV, WebM, MKV, MP3, WAV, M4A, AAC or OGG files");
  // Reserve capacity under the same lock as edits/runs, then validate bytes before committing metadata.
  const assetId = randomUUID(); const filename = `assets/${assetId}.${spec.ext}`; const thumb = `assets/${assetId}-thumb.jpg`;
  const path = filePath(id, filename); const thumbPath = filePath(id, thumb);
  return withRecord(id, async (record) => {
    requireOwner(record, ownerId); assertIdle(record);
    if (record.project.assets.length >= MAX_ASSETS) throw new DirectorError("A production supports up to 50 source assets");
    await mkdir(join(projectPath(id), "assets"), { recursive: true });
    const temp = `${path}.upload`;
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!containerSignature(bytes, spec.ext)) throw new DirectorError("The file contents do not match a supported media container");
      await writeFile(temp, bytes, { mode: 0o600 });
      let duration = 0; let width: number | undefined; let height: number | undefined;
      if (spec.kind === "image") {
        const meta = await sharp(temp, { limitInputPixels: 80_000_000 }).metadata();
        if (!meta.width || !meta.height) throw new DirectorError("This image could not be decoded");
        width = meta.width; height = meta.height;
        await sharp(temp).rotate().resize(640, 640, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(thumbPath);
      } else {
        const probe = await probeMedia(temp);
        if (probe.duration <= 0 || (spec.kind === "video" ? !probe.hasVideo : !probe.hasAudio)) throw new DirectorError("This media file could not be decoded");
        duration = probe.duration; width = probe.width || undefined; height = probe.height || undefined;
        if (spec.kind === "video") await runFfmpeg(["-y", "-hide_banner", "-loglevel", "error", "-ss", String(Math.min(1, duration / 2)), "-i", temp, "-frames:v", "1", "-vf", "scale=640:640:force_original_aspect_ratio=decrease", thumbPath], { timeout: 60000 });
      }
      await rename(temp, path);
      const asset: DirectorAsset = { id: assetId, name: file.name.slice(0, 200), kind: spec.kind, url: `/api/director/projects/${id}/media/${assetId}`, ...(spec.kind !== "audio" ? { thumbnailUrl: `/api/director/projects/${id}/media/${assetId}?thumbnail=1` } : {}), duration, width, height, size: file.size, createdAt: new Date().toISOString() };
      record.files[assetId] = { filename, mime, ...(spec.kind !== "audio" ? { thumbnail: thumb } : {}) };
      record.project.assets.push(asset);
      return { asset, project: record.project };
    } catch (e) { await Promise.all([rm(temp, { force: true }), rm(path, { force: true }), rm(thumbPath, { force: true })]); throw e; }
  });
}
export async function deleteAsset(id: string, ownerId: string, assetId: string) {
  return withRecord(id, (record) => {
    requireOwner(record, ownerId); assertIdle(record);
    if (!record.files[assetId]) throw new DirectorError("Asset not found", 404);
    // Keep original bytes for historical edits/exports; removing only hides it from future work.
    record.project.assets = record.project.assets.filter((a) => a.id !== assetId);
    record.project.scenes = record.project.scenes.map((s) => s.assetId === assetId ? { ...s, assetId: null, sourceIn: 0 } : s);
    if (record.project.audioAssetId === assetId) record.project.audioAssetId = null;
    delete record.files[assetId]; record.project.status = "draft"; record.project.stage = "Asset removed";
    return record.project;
  });
}
