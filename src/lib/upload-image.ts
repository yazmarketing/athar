import { readJson } from "@/lib/utils";
import {
  IMAGE_UPLOAD_APP_MAX_BYTES,
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_TYPES,
} from "@/lib/image-upload-limits";
import { ASSET_MAX_AR, ASSET_MIN_AR, fitAssetSize } from "@/lib/byteplus-asset-size";
import { centerCropToAspectRange } from "@/lib/crop-to-aspect";

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

/**
 * BytePlus rejects faces taller/wider than its limits (a stacked camera
 * shot often fails with "Height must be between 300 and …"). Always fit
 * before we upload a verified-asset photo.
 */
export async function prepareVerifiedFaceImage(file: File): Promise<File> {
  assertImageFile(file);
  if (typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file);
  try {
    const target = fitAssetSize(bitmap.width, bitmap.height);
    if (target.width === bitmap.width && target.height === bitmap.height) {
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    const cover = Math.max(
      target.width / bitmap.width,
      target.height / bitmap.height
    );
    const dw = bitmap.width * cover;
    const dh = bitmap.height * cover;
    ctx.drawImage(
      bitmap,
      (target.width - dw) / 2,
      (target.height - dh) / 2,
      dw,
      dh
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") || "asset";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

/**
 * Seedance rejects stills outside 0.39–2.50. A 1024×310 panorama (3.30)
 * used to upload as-is and fail every video job. Crop here so the stored
 * URL is already legal, even if server-side ffmpeg never runs.
 */
async function clampToSeedanceAspect(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file);
  try {
    const crop = centerCropToAspectRange(
      bitmap.width,
      bitmap.height,
      ASSET_MIN_AR,
      ASSET_MAX_AR
    );
    if (!crop) return file;
    const canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(
      bitmap,
      (bitmap.width - crop.width) / 2,
      (bitmap.height - crop.height) / 2,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") || "still";
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
 * Upload a reference image.
 *
 * The Space has no CORS PUT rule the browser can use (the keys on this
 * project cannot even read/write that config). A failed preflight still
 * logs as a red CORS error even when we catch it — and that is what
 * "new face didn't save" looks like in the asset library. Files that fit
 * through `/api/upload` go that way first. Larger files still PUT to the
 * Space; without CORS those cannot succeed from the browser.
 */
export async function uploadImageFile(file: File): Promise<string> {
  assertImageFile(file);
  file = await compressIfNeeded(file);
  file = await clampToSeedanceAspect(file);
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error("Image must be 32MB or smaller");
  }

  if (file.size <= IMAGE_UPLOAD_APP_MAX_BYTES) {
    return uploadViaApp(file);
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
    throw new Error(
      err instanceof Error
        ? err.message
        : "This image is too large to send through the app. Add a CORS PUT rule on the Space and retry."
    );
  }
}
