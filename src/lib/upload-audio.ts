import { readJson } from "@/lib/utils";
import {
  AUDIO_UPLOAD_MAX_BYTES,
  AUDIO_UPLOAD_TYPES,
  IMAGE_UPLOAD_APP_MAX_BYTES,
} from "@/lib/image-upload-limits";

/**
 * Upload a lip-sync reference audio clip. Same two-step shape as
 * `uploadImageFile`: presigned PUT straight to Spaces first, `/api/upload`
 * as the fallback when the Space has no CORS rule (audio clips for
 * Seedance are ≤30s, so they comfortably fit the 8MB app-server path).
 */

const AUDIO_EXT_RE = /\.(mp3|wav|m4a|aac|ogg|oga)$/i;

/**
 * Browsers are unreliable about audio MIME types — an .m4a can arrive as
 * audio/x-m4a or an empty string — so accept a known extension too.
 */
export function isAudioFile(file: File): boolean {
  return AUDIO_UPLOAD_TYPES.has(file.type) || AUDIO_EXT_RE.test(file.name);
}

function contentTypeFor(file: File): string {
  if (AUDIO_UPLOAD_TYPES.has(file.type)) return file.type;
  const ext = AUDIO_EXT_RE.exec(file.name)?.[1]?.toLowerCase();
  switch (ext) {
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "ogg":
    case "oga":
      return "audio/ogg";
    default:
      return "audio/mpeg";
  }
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
      reject(new Error("Upload blocked — no CORS rule on the Space"));
    xhr.send(file);
  });
}

async function uploadViaApp(file: File, contentType: string): Promise<string> {
  const form = new FormData();
  // Re-wrap so the app route sees a trustworthy content type even when the
  // browser reported none for the original file.
  form.append("file", new File([file], file.name, { type: contentType }));
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const json = await readJson<{ url?: string; error?: string }>(res);
  if (!res.ok || !json.url) {
    throw new Error(json.error ?? "Upload failed");
  }
  return json.url;
}

export async function uploadAudioFile(file: File): Promise<string> {
  if (!isAudioFile(file)) {
    throw new Error("Only MP3, WAV, M4A, AAC, or OGG audio");
  }
  if (file.size > AUDIO_UPLOAD_MAX_BYTES) {
    throw new Error("Audio must be 32MB or smaller");
  }
  const contentType = contentTypeFor(file);

  try {
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
  } catch (err) {
    if (file.size > IMAGE_UPLOAD_APP_MAX_BYTES) {
      throw new Error(
        err instanceof Error
          ? err.message
          : "This audio file is too large to send through the app. Add a CORS PUT rule on the Space and retry."
      );
    }
    return uploadViaApp(file, contentType);
  }
}
