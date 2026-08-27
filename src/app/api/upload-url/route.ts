import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { presignUpload } from "@/lib/storage";
import {
  AUDIO_UPLOAD_TYPES,
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_TYPES,
  VIDEO_UPLOAD_MAX_BYTES,
  VIDEO_UPLOAD_TYPES,
} from "@/lib/image-upload-limits";

const AUDIO_EXTS: [string, string][] = [
  ["mpeg", "mp3"],
  ["mp3", "mp3"],
  ["wav", "wav"],
  ["m4a", "m4a"],
  ["mp4", "m4a"],
  ["aac", "aac"],
  ["ogg", "ogg"],
];

function extFor(contentType: string, filename: string): string {
  if (AUDIO_UPLOAD_TYPES.has(contentType)) {
    const fromName = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase();
    if (fromName && AUDIO_EXTS.some(([, ext]) => ext === fromName)) {
      return fromName;
    }
    return AUDIO_EXTS.find(([hint]) => contentType.includes(hint))?.[1] ?? "mp3";
  }
  if (contentType === "video/quicktime" || filename.toLowerCase().endsWith(".mov")) {
    return "mov";
  }
  if (VIDEO_UPLOAD_TYPES.has(contentType)) {
    return "mp4";
  }
  if (contentType.includes("png") || filename.toLowerCase().endsWith(".png")) {
    return "png";
  }
  if (contentType.includes("webp") || filename.toLowerCase().endsWith(".webp")) {
    return "webp";
  }
  return "jpg";
}

/**
 * Presigned PUT for reference images, lip-sync reference audio, and
 * Seedance reference video clips. A 29MB PNG (or any video) must not travel
 * through `/api/upload` — that path buffers the file in memory on a 1 GiB
 * instance.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const body = (await req.json()) as {
      filename?: string;
      contentType?: string;
      bytes?: number;
    };
    const contentType = body.contentType?.trim() ?? "";
    const filename = body.filename?.trim() ?? "";
    const isVideo = VIDEO_UPLOAD_TYPES.has(contentType);
    if (
      !IMAGE_UPLOAD_TYPES.has(contentType) &&
      !AUDIO_UPLOAD_TYPES.has(contentType) &&
      !isVideo
    ) {
      return NextResponse.json(
        {
          error:
            "Only JPEG, PNG, or WebP images — MP3, WAV, M4A, AAC, or OGG audio — or MP4/MOV video",
        },
        { status: 400 }
      );
    }
    const bytes = Number(body.bytes);
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return NextResponse.json({ error: "File size is required" }, { status: 400 });
    }
    const maxBytes = isVideo ? VIDEO_UPLOAD_MAX_BYTES : IMAGE_UPLOAD_MAX_BYTES;
    if (bytes > maxBytes) {
      return NextResponse.json(
        { error: `File must be ${Math.round(maxBytes / (1024 * 1024))}MB or smaller` },
        { status: 413 }
      );
    }

    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `references/${stamp}-${rand}.${extFor(contentType, filename)}`;
    const { uploadUrl, publicUrl } = await presignUpload({
      path,
      contentType,
    });
    return NextResponse.json({ uploadUrl, publicUrl, path });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not sign upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
