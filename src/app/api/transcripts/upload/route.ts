import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { APP_FORMDATA_MAX_BYTES } from "@/lib/audio-chunks";
import { uploadPublicObject } from "@/lib/storage";
import { mediaExtension, mediaKindFor } from "@/lib/media-types";

/**
 * Server-side media upload — the fallback for when the presigned PUT cannot
 * run from the browser, and nothing more than that.
 *
 * This path buffers the whole file in memory. Athar runs on a 1 GiB App
 * Platform instance, so a large upload here does not fail politely: it takes
 * the studio down for everyone, mid-render. The cap matches the FormData
 * parser: past ~8MB `req.formData()` throws "Failed to parse body as
 * FormData" before the size check can run.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const kind = mediaKindFor(file.type, file.name);
    if (!kind) {
      return NextResponse.json(
        { error: "Only audio and video files can be transcribed" },
        { status: 400 }
      );
    }
    if (file.size > APP_FORMDATA_MAX_BYTES) {
      return NextResponse.json(
        {
          error:
            "This file has to go straight to storage, and the browser could not: " +
            "add a CORS rule on the Space allowing PUT from this origin. " +
            "Files under 8MB can come through here.",
        },
        { status: 413 }
      );
    }

    const ext = mediaExtension(file.type, file.name);
    const path = `transcripts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const url = await uploadPublicObject(
      path,
      await file.arrayBuffer(),
      file.type || "application/octet-stream"
    );
    return NextResponse.json({ publicUrl: url, path, mediaKind: kind });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    if (/formData/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Could not read the file. Uploads through this path must be 8MB or smaller.",
        },
        { status: 413 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

