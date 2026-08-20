import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { getTranscript, listSegments, updateTranscript } from "@/lib/transcripts";
import { generateInsights } from "@/lib/transcript-ai";

type Params = { params: Promise<{ id: string }> };

/** Summary, decisions, chapters and clip picks. Cached on the transcript. */
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const { id } = await params;

    const transcript = await getTranscript(id);
    if (!transcript) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (transcript.status !== "ready") {
      return NextResponse.json(
        { error: "This transcript is not finished yet" },
        { status: 409 }
      );
    }

    const force = req.nextUrl.searchParams.get("refresh") === "true";
    if (transcript.insights && !force) {
      return NextResponse.json({ insights: transcript.insights, cached: true });
    }

    const segments = await listSegments(id);
    const insights = await generateInsights(transcript, segments);
    await updateTranscript(id, { insights });
    return NextResponse.json({ insights, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read the transcript";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
