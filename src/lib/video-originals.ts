import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { uploadPublicObject } from "@/lib/storage";
import { ensureBrowserMp4 } from "@/lib/video-compat";
import type { ArkVideoRequest } from "@/lib/byteplus-server";

async function downloadOriginal(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Could not retrieve original video (${response.status})`);
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error("The original video is empty");
  const type = response.headers.get("content-type")?.split(";")[0];
  const mov = type === "video/quicktime" || /\.mov(?:\?|$)/i.test(url);
  return { bytes, contentType: mov ? "video/quicktime" : "video/mp4", ext: mov ? "mov" : "mp4" };
}

/** Preserve the exact provider bytes before making a separate playback copy. */
export async function persistVideoOutput(url: string, key: string) {
  const original = await downloadOriginal(url);
  const originalUrl = await uploadPublicObject(`video-originals/${key}.${original.ext}`, original.bytes, original.contentType);
  const playback = await ensureBrowserMp4(original.bytes);
  if (playback === original.bytes) return { originalUrl, outputUrl: originalUrl };
  try {
    const outputUrl = await uploadPublicObject(`video-previews/${key}.mp4`, playback, "video/mp4");
    return { originalUrl, outputUrl };
  } catch {
    // The paid render remains available even if only its preview could not be saved.
    return { originalUrl, outputUrl: originalUrl };
  }
}

/** Resolve library references on the server, including saved jobs and reference clips. */
export async function resolveOriginalVideoReferences(request: ArkVideoRequest): Promise<ArkVideoRequest> {
  const urls = [...new Set([...(request.videoUrls ?? []), ...(request.referenceVideoUrls ?? [])])];
  if (!urls.length) return request;
  const { rows } = await db().query<{
    id: string; output_url: string; fal_url: string | null; input_payload: Record<string, unknown>;
  }>(`select id, output_url, fal_url, input_payload from generations
      where output_url = any($1::text[]) and deleted_at is null
        and model_endpoint like 'byteplus:%seedance%'
        and mode in ('t2v', 'i2v', 'v2v')`, [urls]);
  const originals = new Map<string, string>();
  for (const row of rows) {
    let originalUrl = row.input_payload?.original_video_url;
    if (typeof originalUrl !== "string" || !originalUrl) {
      // Legacy renders can be repaired only while their provider download still works.
      if (!row.fal_url) throw new Error("The original of this library video is unavailable. Generate a new clip before editing it.");
      try {
        const original = await downloadOriginal(row.fal_url);
        originalUrl = await uploadPublicObject(`video-originals/${row.id}-${randomUUID()}.${original.ext}`, original.bytes, original.contentType);
        await db().query(`update generations set input_payload = coalesce(input_payload, '{}'::jsonb) || jsonb_build_object('original_video_url', $2::text) where id = $1`, [row.id, originalUrl]);
      } catch {
        throw new Error("The original of this older video is no longer available from BytePlus. Generate a new clip before editing it; your existing video is still saved.");
      }
    }
    originals.set(row.output_url, originalUrl as string);
  }
  const resolve = (url: string) => originals.get(url) ?? url;
  return { ...request, videoUrls: request.videoUrls?.map(resolve), referenceVideoUrls: request.referenceVideoUrls?.map(resolve) };
}
