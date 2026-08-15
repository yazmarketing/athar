import { NextRequest, NextResponse } from "next/server";
import { resolveShare } from "@/lib/shares";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

type Params = { params: Promise<{ token: string }> };

/**
 * Streams a shared generation's media through the app.
 *
 * Public by design — this is the whole point of a share link — but it goes
 * through the token, so the underlying Spaces URL never appears in anything
 * that gets sent to a recipient, and revoking the token kills the image too.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const generation = await resolveShare(token);
  if (!generation?.output_url) {
    return new NextResponse("Not found", { status: 404 });
  }

  const upstream = await fetch(generation.output_url);
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Upstream unavailable", { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Length": upstream.headers.get("content-length") ?? "",
      // Short cache: long enough for a preview crawler and a page reload,
      // short enough that a revoked link stops resolving quickly.
      "Cache-Control": "public, max-age=300",
    },
  });
}
