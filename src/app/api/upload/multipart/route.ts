import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import {
  VIDEO_UPLOAD_MAX_BYTES,
  VIDEO_UPLOAD_TYPES,
} from "@/lib/image-upload-limits";
import {
  readMultipartTicket,
  signMultipartTicket,
} from "@/lib/multipart-ticket";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  startMultipartUpload,
} from "@/lib/storage";

export const maxDuration = 60;

const REF_PATH_RE = /^references\/\d+-[a-z0-9]+\.(mp4|mov)$/;

function videoExt(contentType: string, filename: string): "mp4" | "mov" {
  if (contentType === "video/quicktime" || filename.toLowerCase().endsWith(".mov")) {
    return "mov";
  }
  return "mp4";
}

function isVideoType(contentType: string, filename: string): boolean {
  return (
    VIDEO_UPLOAD_TYPES.has(contentType) ||
    /\.(mp4|mov)$/i.test(filename)
  );
}

function ticketOk(
  token: unknown,
  expected: { userId: string; uploadId: string; path: string }
): boolean {
  return (
    typeof token === "string" &&
    REF_PATH_RE.test(expected.path) &&
    readMultipartTicket(token, expected)
  );
}

/**
 * Same-origin multipart upload for reference videos.
 *
 * The Space has no CORS PUT rule the browser can use, and these keys
 * cannot write one (`AccessDenied`). Chunks stay on our origin instead.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const userId = auth.user.id;

    const body = (await req.json()) as {
      action?: string;
      filename?: string;
      contentType?: string;
      bytes?: number;
      uploadId?: string;
      path?: string;
      token?: string;
      parts?: { partNumber?: number; etag?: string }[];
    };
    const action = body.action?.trim() || "start";

    if (action === "start") {
      const contentType = body.contentType?.trim() ?? "";
      const filename = body.filename?.trim() ?? "";
      if (!isVideoType(contentType, filename)) {
        return NextResponse.json(
          { error: "Only MP4 or MOV video" },
          { status: 400 }
        );
      }
      const bytes = Number(body.bytes);
      if (!Number.isFinite(bytes) || bytes <= 0) {
        return NextResponse.json({ error: "File size is required" }, { status: 400 });
      }
      if (bytes > VIDEO_UPLOAD_MAX_BYTES) {
        return NextResponse.json(
          { error: "Video must be 100MB or smaller" },
          { status: 413 }
        );
      }
      const type = VIDEO_UPLOAD_TYPES.has(contentType)
        ? contentType
        : filename.toLowerCase().endsWith(".mov")
          ? "video/quicktime"
          : "video/mp4";
      const stamp = Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      const path = `references/${stamp}-${rand}.${videoExt(type, filename)}`;
      const { uploadId, publicUrl } = await startMultipartUpload({
        path,
        contentType: type,
      });
      const token = signMultipartTicket({ userId, uploadId, path });
      return NextResponse.json({ uploadId, path, publicUrl, token });
    }

    const uploadId = body.uploadId?.trim() ?? "";
    const path = body.path?.trim() ?? "";
    if (!uploadId || !ticketOk(body.token, { userId, uploadId, path })) {
      return NextResponse.json({ error: "Upload session expired" }, { status: 403 });
    }

    if (action === "abort") {
      await abortMultipartUpload({ path, uploadId });
      return NextResponse.json({ ok: true });
    }

    if (action === "complete") {
      const parts = (body.parts ?? [])
        .map((p) => ({
          partNumber: Number(p.partNumber),
          etag: typeof p.etag === "string" ? p.etag : "",
        }))
        .filter((p) => Number.isInteger(p.partNumber) && p.partNumber > 0 && p.etag);
      if (!parts.length) {
        return NextResponse.json({ error: "No parts to complete" }, { status: 400 });
      }
      await completeMultipartUpload({ path, uploadId, parts });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
