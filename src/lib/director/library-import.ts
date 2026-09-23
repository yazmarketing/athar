import "server-only";
import { getGeneration } from "../generations-store";
import { getTtsGeneration } from "../tts";
import { addAsset } from "./media";
import { DirectorError, getProject, MAX_UPLOAD_BYTES, withRecord } from "./store";

export function libraryMediaUrl(raw: string): URL {
  const url = new URL(raw);
  const origins = [
    process.env.DO_SPACES_CDN_URL ? new URL(process.env.DO_SPACES_CDN_URL).origin : null,
    process.env.DO_SPACES_BUCKET && process.env.DO_SPACES_REGION
      ? `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_REGION}.digitaloceanspaces.com` : null,
  ];
  if (url.protocol !== "https:" || url.username || url.password || !origins.includes(url.origin)) {
    throw new DirectorError("This item is still on temporary provider storage. Download it from the library and upload the file to Director.");
  }
  return url;
}

export async function importLibraryAsset(projectId: string, ownerId: string, source: unknown, sourceId: unknown) {
  await getProject(projectId, ownerId);
  if ((source !== "generation" && source !== "voice") || typeof sourceId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sourceId)) {
    throw new DirectorError("Choose an item from the Athar library");
  }
  // Athar's generation/voice libraries are shared by signed-in workspace members.
  // Resolve an existing record; never accept a caller-provided network URL.
  const record = source === "voice" ? await getTtsGeneration(sourceId) : await getGeneration(sourceId);
  if (!record || !record.output_url || !["ready", "qc_flagged"].includes(record.status) || ("archived_at" in record && record.archived_at)) {
    throw new DirectorError("This library item is unavailable or has not finished yet", 404);
  }
  const url = libraryMediaUrl(record.output_url);
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60_000) });
  if (!res.ok || !res.body) throw new DirectorError("The library media could not be retrieved. Please try again.", 502);
  if (Number(res.headers.get("content-length")) > MAX_UPLOAD_BYTES) {
    await res.body.cancel(); throw new DirectorError("This item exceeds the 100 MB import limit", 413);
  }
  const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length;
      if (size > MAX_UPLOAD_BYTES) throw new DirectorError("This item exceeds the 100 MB import limit", 413);
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = Buffer.concat(chunks);
  const title = "title" in record ? record.title : record.final_prompt.slice(0, 100);
  const fallback = source === "voice" ? "audio/mpeg" : "mode" in record && record.mode === "t2i" ? "image/png" : "video/mp4";
  const suppliedMime = res.headers.get("content-type")?.split(";")[0];
  const mime = suppliedMime && /^(image|video|audio)\//.test(suppliedMime) ? suppliedMime : fallback;
  const ext = mime === "audio/mpeg" ? "mp3" : mime.split("/")[1]?.replace("jpeg", "jpg") || "bin";
  const result = await addAsset(projectId, ownerId, new File([bytes], `${title || "Athar creation"}.${ext}`, { type: mime }));
  return withRecord(projectId, (stored) => {
    const asset = stored.project.assets.find((a) => a.id === result.asset.id)!;
    asset.description = `Imported from Athar ${source === "voice" ? "Voice" : "Library"}, item ${sourceId}.`;
    if (source === "voice" && "text" in record) asset.transcript = record.text.slice(0, 12000);
    return { project: stored.project, asset };
  });
}
