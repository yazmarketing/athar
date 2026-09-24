import "server-only";
import { isBytePlusMediaUrl, resolveAssetImageUrl } from "@/lib/byteplus-assets";
import { readPrivateObject, uploadPrivateObject } from "@/lib/storage";

type Preview = { bytes: ArrayBuffer; contentType: string; needsPersist: boolean };
const pending = new Map<string, Promise<Preview>>();
const MAX_BYTES = 30 * 1024 * 1024;
const pathFor = (id: string) => `asset-previews/${id}`;

async function readImage(response: Response): Promise<Omit<Preview, "needsPersist">> {
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!/^image\/(png|jpeg|webp|gif|avif|bmp|tiff)$/i.test(contentType)) throw new Error("Asset preview is not an image");
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Asset preview is too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Asset preview is empty");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 5_000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (timedOut) throw new Error("Asset preview download timed out");
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("Asset preview is too large");
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
  }
  if (!size) throw new Error("Asset preview is empty");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { bytes: bytes.buffer, contentType };
}

async function load(id: string): Promise<Preview> {
  // Durable cache survives deploys and avoids both GetAsset and its signed URL.
  try {
    const cached = await readPrivateObject(pathFor(id));
    if (cached?.ok) return { ...await readImage(cached), needsPersist: false };
    await cached?.body?.cancel();
  } catch { /* Storage unavailable or not configured: try the provider. */ }

  // Both metadata and image requests are bounded; refresh an expired signed URL once.
  for (const refresh of [false, true]) {
    const url = await resolveAssetImageUrl(id, { refresh, timeoutMs: 5_000 });
    if (!url || !isBytePlusMediaUrl(url)) throw new Error("Asset preview is unavailable");
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: "error" });
    if (response.ok) return { ...await readImage(response), needsPersist: true };
    await response.body?.cancel();
    if (!refresh && [401, 403].includes(response.status)) continue;
    throw new Error(`Could not load asset image (${response.status})`);
  }
  throw new Error("Asset preview is unavailable");
}

/** Collapse repeated requests for a thumbnail into one provider lookup per worker. */
export async function loadAssetPreview(id: string): Promise<Preview> {
  const existing = pending.get(id);
  if (existing) return existing;
  const promise = load(id).finally(() => pending.delete(id));
  pending.set(id, promise);
  return promise;
}

export async function persistAssetPreview(id: string, preview: Preview) {
  if (preview.needsPersist) await uploadPrivateObject(pathFor(id), preview.bytes, preview.contentType);
}
