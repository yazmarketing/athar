import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { uploadPublicObject } from "@/lib/storage";
import { AUDIO_UPLOAD_TYPES } from "@/lib/image-upload-limits";

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  ...AUDIO_UPLOAD_TYPES,
]);

const AUDIO_EXT_HINTS: [string, string][] = [
  ["mpeg", "mp3"],
  ["mp3", "mp3"],
  ["wav", "wav"],
  ["m4a", "m4a"],
  ["mp4", "m4a"],
  ["aac", "aac"],
  ["ogg", "ogg"],
];

export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        {
          error:
            "Only JPEG, PNG, or WebP images — or MP3, WAV, M4A, AAC, or OGG audio",
        },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File must be 8MB or smaller" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const ext = file.type.startsWith("audio/")
      ? (AUDIO_EXT_HINTS.find(([hint]) => file.type.includes(hint))?.[1] ??
        "mp3")
      : file.type.includes("png")
        ? "png"
        : file.type.includes("webp")
          ? "webp"
          : "jpg";
    const path = `references/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const url = await uploadPublicObject(path, buffer, file.type);
    return NextResponse.json({ url, path });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    // A 29MB PNG dies in formData() before the 8MB check, and used to
    // surface as the raw parser error. Spell out the actual limit.
    if (/formData/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Could not read the file. Images through this path must be 8MB or smaller.",
        },
        { status: 413 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
