import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

function isAllowedImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const bucket = process.env.DO_SPACES_BUCKET;
    const region = process.env.DO_SPACES_REGION;
    const cdn = process.env.DO_SPACES_CDN_URL;
    const hosts = new Set<string>();
    if (bucket && region) {
      hosts.add(`${bucket}.${region}.digitaloceanspaces.com`);
    }
    if (cdn) {
      try {
        hosts.add(new URL(cdn).hostname);
      } catch {
        /* ignore */
      }
    }
    // Also allow BytePlus CDN URLs used before Spaces copy
    const host = u.hostname.toLowerCase();
    if (hosts.has(host)) return true;
    if (host.endsWith(".byteplusapi.com")) return true;
    if (host.endsWith(".byteimg.com")) return true;
    return false;
  } catch {
    return false;
  }
}

/** Proxies a generation image so the browser can download/convert same-origin. */
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams.get("url");
    if (!url || !isAllowedImageUrl(url)) {
      return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
    }

    const upstream = await fetch(url);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream fetch failed (${upstream.status})` },
        { status: 502 }
      );
    }

    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
