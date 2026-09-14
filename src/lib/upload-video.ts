import { readJson } from "@/lib/utils";
import {
  VIDEO_UPLOAD_MAX_BYTES,
  VIDEO_UPLOAD_PART_BYTES,
  VIDEO_UPLOAD_TYPES,
} from "@/lib/image-upload-limits";

/**
 * Upload a Seedance reference video clip (subject/motion/style — not an
 * edit source, which is attached from an existing Library render instead).
 *
 * The Space has no CORS PUT rule the browser can use, and the keys on this
 * project cannot write one. A 100MB clip also cannot go through `/api/upload`
 * (that path buffers the whole file). Chunks go same-origin to
 * `/api/upload/multipart` instead.
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

type StartJson = {
  uploadId?: string;
  path?: string;
  publicUrl?: string;
  token?: string;
  error?: string;
};

async function abortUpload(session: {
  uploadId: string;
  path: string;
  token: string;
}): Promise<void> {
  try {
    await fetch("/api/upload/multipart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "abort", ...session }),
    });
  } catch {
    // Best-effort cleanup — Spaces will expire incomplete uploads.
  }
}

export async function uploadVideoFile(file: File): Promise<string> {
  if (!isVideoFile(file)) {
    throw new Error("Only MP4 or MOV video");
  }
  if (file.size <= 0) {
    throw new Error("Video file is empty");
  }
  if (file.size > VIDEO_UPLOAD_MAX_BYTES) {
    throw new Error("Video must be 100MB or smaller");
  }
  const contentType = contentTypeFor(file);

  const startRes = await fetch("/api/upload/multipart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "start",
      filename: file.name,
      contentType,
      bytes: file.size,
    }),
  });
  const start = await readJson<StartJson>(startRes);
  if (
    !startRes.ok ||
    !start.uploadId ||
    !start.path ||
    !start.publicUrl ||
    !start.token
  ) {
    throw new Error(start.error ?? "Could not prepare the upload");
  }
  const session = {
    uploadId: start.uploadId,
    path: start.path,
    token: start.token,
  };

  try {
    const parts: { partNumber: number; etag: string }[] = [];
    const total = Math.max(1, Math.ceil(file.size / VIDEO_UPLOAD_PART_BYTES));
    for (let i = 0; i < total; i++) {
      const startAt = i * VIDEO_UPLOAD_PART_BYTES;
      const blob = file.slice(startAt, startAt + VIDEO_UPLOAD_PART_BYTES);
      const res = await fetch("/api/upload/multipart/part", {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-upload-id": session.uploadId,
          "x-upload-path": session.path,
          "x-upload-token": session.token,
          "x-part-number": String(i + 1),
        },
        body: blob,
      });
      const json = await readJson<{ etag?: string; error?: string }>(res);
      if (!res.ok || !json.etag) {
        throw new Error(json.error ?? "Could not upload the video");
      }
      parts.push({ partNumber: i + 1, etag: json.etag });
    }

    const done = await fetch("/api/upload/multipart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete", ...session, parts }),
    });
    const doneJson = await readJson<{ error?: string }>(done);
    if (!done.ok) {
      throw new Error(doneJson.error ?? "Could not finish the upload");
    }
    return start.publicUrl;
  } catch (err) {
    await abortUpload(session);
    throw err;
  }
}
