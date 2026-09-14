import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import {
  isBytePlusMediaUrl,
  resolveAssetImageUrl,
} from "@/lib/byteplus-assets";

type Params = { params: Promise<{ id: string }> };

const ASSET_ID_RE = /^asset-[a-z0-9-]+$/i;

/**
 * BytePlus stores the verified photo on TOS with a signed URL that the
 * browser cannot load from this origin (empty cards in the asset library).
 * Fetch it server-side and stream it same-origin.
 */
export async function GET(_req: Request, { params }: Params) {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!ASSET_ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid asset id" }, { status: 400 });
  }

  try {
    const imageUrl = await resolveAssetImageUrl(id);
    if (!imageUrl || !isBytePlusMediaUrl(imageUrl)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const upstream = await fetch(imageUrl);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Could not load asset image (${upstream.status})` },
        { status: 502 }
      );
    }

    const contentType =
      upstream.headers.get("content-type") ?? "image/png";
    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load asset image";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
