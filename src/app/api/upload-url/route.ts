import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { presignUpload } from "@/lib/storage";
import {
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_TYPES,
} from "@/lib/image-upload-limits";

function extFor(contentType: string, filename: string): string {
  if (contentType.includes("png") || filename.toLowerCase().endsWith(".png")) {
    return "png";
  }
  if (contentType.includes("webp") || filename.toLowerCase().endsWith(".webp")) {
    return "webp";
  }
  return "jpg";
}

/**
 * Presigned PUT for reference images. A 29MB PNG must not travel through
 * `/api/upload` — that path buffers the file in memory on a 1 GiB instance.
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
    if (!IMAGE_UPLOAD_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, or WebP images are allowed" },
        { status: 400 }
      );
    }
    const bytes = Number(body.bytes);
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return NextResponse.json({ error: "File size is required" }, { status: 400 });
    }
    if (bytes > IMAGE_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { error: "Image must be 32MB or smaller" },
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
