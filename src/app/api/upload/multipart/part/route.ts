import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { VIDEO_UPLOAD_PART_MAX_BYTES } from "@/lib/image-upload-limits";
import { readMultipartTicket } from "@/lib/multipart-ticket";
import { uploadMultipartPart } from "@/lib/storage";

export const maxDuration = 60;

const REF_PATH_RE = /^references\/\d+-[a-z0-9]+\.(mp4|mov)$/;

/**
 * One 5MB (ish) part of a reference-video multipart upload. Body is raw
 * bytes so we never run it through the FormData parser.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const uploadId = req.headers.get("x-upload-id")?.trim() ?? "";
    const path = req.headers.get("x-upload-path")?.trim() ?? "";
    const token = req.headers.get("x-upload-token")?.trim() ?? "";
    const partNumber = Number(req.headers.get("x-part-number"));
    if (
      !uploadId ||
      !REF_PATH_RE.test(path) ||
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > 10_000 ||
      !readMultipartTicket(token, {
        userId: auth.user.id,
        uploadId,
        path,
      })
    ) {
      return NextResponse.json({ error: "Upload session expired" }, { status: 403 });
    }

    const body = new Uint8Array(await req.arrayBuffer());
    if (body.byteLength === 0) {
      return NextResponse.json({ error: "Empty part" }, { status: 400 });
    }
    if (body.byteLength > VIDEO_UPLOAD_PART_MAX_BYTES) {
      return NextResponse.json({ error: "Part is too large" }, { status: 413 });
    }

    const { etag } = await uploadMultipartPart({
      path,
      uploadId,
      partNumber,
      body,
    });
    return NextResponse.json({ etag });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not upload part";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
