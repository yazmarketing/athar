import { readJson } from "@/lib/utils";
import {
  IMAGE_UPLOAD_APP_MAX_BYTES,
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_TYPES,
} from "@/lib/image-upload-limits";

/** Longest edge after shrinking a huge PNG so models can actually use it. */
const MAX_EDGE = 4096;

function assertImageFile(file: File) {
  if (!IMAGE_UPLOAD_TYPES.has(file.type)) {
    throw new Error("Only JPEG, PNG, or WebP images");
  }
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error("Image must be 32MB or smaller");
  }
}

/**
 * A 29MB PNG is usually uncompressed pixels, not extra detail. Shrink it
 * so Nano Banana can inline it; keep the original when it's already small.
 */
async function compressIfNeeded(file: File): Promise<File> {
  if (file.size <= IMAGE_UPLOAD_APP_MAX_BYTES) return file;
  if (typeof createImageBitmap !== "function") return file;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") || "reference";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

/** PUT the file to a Spaces presigned URL. Same headers the URL was signed with. */
function putToSpace(url: string, file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
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

async function uploadViaApp(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const json = await readJson<{ url?: string; error?: string }>(res);
  if (!res.ok || !json.url) {
    throw new Error(json.error ?? "Upload failed");
  }
  return json.url;
}

/**
 * Upload a reference image. Files over 8MB go straight to Spaces so they
 * never hit the app-server body parser (that is the FormData error on a
 * 29MB PNG). Smaller files fall back to `/api/upload` if CORS is missing.
 */
export async function uploadImageFile(file: File): Promise<string> {
  assertImageFile(file);
  file = await compressIfNeeded(file);
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error("Image must be 32MB or smaller");
  }

  try {
    const res = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
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
    await putToSpace(json.uploadUrl, file);
    return json.publicUrl;
  } catch (err) {
    if (file.size > IMAGE_UPLOAD_APP_MAX_BYTES) {
      throw new Error(
        err instanceof Error
          ? err.message
          : "This image is too large to send through the app. Add a CORS PUT rule on the Space and retry."
      );
    }
    return uploadViaApp(file);
  }
}
