import { NextRequest, NextResponse } from "next/server";
import { getSharedTtsGeneration } from "@/lib/tts";

type Params = { params: Promise<{ token: string }> };

/**
 * Downloads a shared voice-over. Gated by the share token itself, not a
 * session — a share link is explicitly for people without a studio login,
 * so the download has to work without one too.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    const generation = await getSharedTtsGeneration(token);
    if (!generation?.output_url) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const upstream = await fetch(generation.output_url);
    if (!upstream.ok) {
      return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
    }

    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "audio/wav",
        "Content-Disposition": `attachment; filename="${(generation.title || "voice-over").replace(/[^\w.-]+/g, "-")}.wav"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
