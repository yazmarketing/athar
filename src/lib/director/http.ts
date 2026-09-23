import "server-only";
import { NextResponse } from "next/server";
import { access, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import ffmpeg from "ffmpeg-static";
import { getSessionUser } from "../auth-session";
import { canGenerate } from "../authz";
import { directorConfigured, directorModel } from "./planner";
import { DirectorError, filePath, readRecord, requireOwner, rootPath } from "./store";

export type ProjectContext = { params: Promise<{ id: string }> };
export async function directorUser(write = false) {
  const user = await getSessionUser();
  if (!user?.id) throw new DirectorError("Unauthorized", 401);
  if (write && !canGenerate(user.role)) throw new DirectorError("Creator access is required to edit or render a production", 403);
  return user;
}
export function directorError(error: unknown) {
  const status = error instanceof DirectorError ? error.status : 500;
  const raw = error instanceof Error ? error.message : "Director request failed";
  const safe = raw.split(rootPath()).join("[private media]").split(process.cwd()).join("[application]").replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 1600);
  return NextResponse.json({ error: safe }, { status });
}
export async function directorBody(req: Request) {
  try { const body = await req.json(); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); return body as Record<string, unknown>; }
  catch { throw new DirectorError("Invalid JSON request", 400); }
}
export async function directorCapabilities() {
  const renderAvailable = ffmpeg ? await access(ffmpeg).then(() => true).catch(() => false) : false;
  return { astraConfigured: directorConfigured(), model: directorModel(), renderAvailable };
}
export function parseRange(value: string | null, size: number): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new DirectorError("Invalid byte range", 416);
  let start: number; let end: number;
  if (!match[1]) { const suffix = Number(match[2]); if (!suffix) throw new DirectorError("Invalid byte range", 416); start = Math.max(0, size - suffix); end = size - 1; }
  else { start = Number(match[1]); end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new DirectorError("Invalid byte range", 416);
  return { start, end };
}
export async function serveDirectorMedia(req: Request, id: string, mediaId: string, head = false) {
  const user = await directorUser(); const record = await readRecord(id); requireOwner(record, user.id);
  const stored = record.files[mediaId] || record.exportFiles[mediaId];
  if (!stored) throw new DirectorError("Media not found", 404);
  const url = new URL(req.url); const thumbnail = url.searchParams.get("thumbnail") === "1";
  const filename = thumbnail ? stored.thumbnail : stored.filename;
  if (!filename) throw new DirectorError("Media not found", 404);
  const path = filePath(id, filename); const info = await stat(path).catch(() => null);
  if (!info) throw new DirectorError("Media not found", 404);
  const headers = new Headers({ "Content-Type": thumbnail ? "image/jpeg" : stored.mime, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  if (url.searchParams.get("download") === "1") headers.set("Content-Disposition", `attachment; filename="athar-director-${mediaId}.${thumbnail ? "jpg" : stored.mime === "video/mp4" ? "mp4" : "media"}"`);
  let range: ReturnType<typeof parseRange>;
  try { range = parseRange(req.headers.get("range"), info.size); }
  catch { headers.set("Content-Range", `bytes */${info.size}`); return new Response(null, { status: 416, headers }); }
  const start = range?.start ?? 0; const end = range?.end ?? info.size - 1;
  headers.set("Content-Length", String(end - start + 1));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
  const stream = head ? null : Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(stream, { status: range ? 206 : 200, headers });
}
