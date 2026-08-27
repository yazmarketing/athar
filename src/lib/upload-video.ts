import { readJson } from "@/lib/utils";
import { VIDEO_UPLOAD_MAX_BYTES, VIDEO_UPLOAD_TYPES } from "@/lib/image-upload-limits";

/**
 * Upload a Seedance reference video clip (subject/motion/style — not an
 * edit source, which is attached from an existing Library render instead).
 * Presigned PUT straight to Spaces only: at up to 100MB these clips are far
 * past what `/api/upload`'s 8MB app-server fallback can buffer, so unlike
 * `uploadImageFile`/`uploadAudioFile` there is no fallback path — a missing
 * CORS PUT rule on the Space surfaces as a real error here, not a retry.
 */

const VIDEO_EXT_RE = /\.(mp4|mov)$/i;

/** Browsers can report an empty type for a dragged .mov — accept by extension too. */
export function isVideoFile(file: File): boolean {
  return VIDEO_UPLOAD_TYPES.has(file.type) || VIDEO_EXT_RE.test(file.name);
}

function contentTypeFor(file: File): string {
  if (VIDEO_UPLOAD_TYPES.has(file.type)) return file.type;
  return /\.mov$/i.test(file.name) ? "video/quicktime" : "video/mp4";
}

function putToSpace(url: string, file: File, contentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-amz-acl", "public-read");
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage rejected the upload (${xhr.status})`));
    xhr.onerror = () =>
      reject(new Error("Upload blocked — no CORS PUT rule on the Space"));
    xhr.send(file);
  });
}

export async function uploadVideoFile(file: File): Promise<string> {
  if (!isVideoFile(file)) {
    throw new Error("Only MP4 or MOV video");
  }
  if (file.size > VIDEO_UPLOAD_MAX_BYTES) {
    throw new Error("Video must be 100MB or smaller");
  }
  const contentType = contentTypeFor(file);

  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType,
      bytes: file.size,
    }),
  });
  const json = await readJson<{
    uploadUrl?: string;
    publicUrl?: string;
    error?: string;
  }>(res);
  if (!res.ok || !json.uploadUrl || !json.publicUrl) {
    throw new Error(json.error ?? "Could not prepare the upload");
  }
  await putToSpace(json.uploadUrl, file, contentType);
  return json.publicUrl;
}
