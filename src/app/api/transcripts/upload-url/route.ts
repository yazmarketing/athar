import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { presignUpload } from "@/lib/storage";
import { mediaExtension, mediaKindFor } from "@/lib/media-types";

/**
 * Hand the browser a presigned PUT so a two-hour interview never travels
 * through the app server. Falls back to /api/transcripts/upload when the
 * Space has no CORS rule for this origin.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const body = (await req.json()) as {
      filename?: string;
      contentType?: string;
    };
    const contentType = body.contentType?.trim() ?? "";
    const kind = mediaKindFor(contentType, body.filename ?? "");
    if (!kind) {
      return NextResponse.json(
        { error: "Only audio and video files can be transcribed" },
        { status: 400 }
      );
    }

    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const ext = mediaExtension(contentType, body.filename ?? "");
    const path = `transcripts/${stamp}-${rand}.${ext}`;
    const { uploadUrl, publicUrl } = await presignUpload({
      path,
      contentType: contentType || "application/octet-stream",
    });
    return NextResponse.json({ uploadUrl, publicUrl, path, mediaKind: kind });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not sign upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
