import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { isAllowedAssetUrl } from "@/lib/tts-asset-proxy";

/**
 * Streams a voice sample or avatar from the provider's domain through our
 * own origin, so the browser never talks to it directly — see
 * lib/tts-asset-proxy.ts for why. Only ever called with a URL this app
 * itself handed the client (see /api/tts/voices), not one a client can pick.
 */
export async function GET(req: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = req.nextUrl.searchParams.get("u");
  if (!target || !isAllowedAssetUrl(target)) {
    return NextResponse.json({ error: "Invalid asset" }, { status: 400 });
  }

  const upstream = await fetch(target, {
    headers: process.env.MUNSIT_API_KEY ? { "x-api-key": process.env.MUNSIT_API_KEY } : {},
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Could not load that asset" }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
