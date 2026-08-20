import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { getTranscript, listSegments } from "@/lib/transcripts";
import { answerQuestion } from "@/lib/transcript-ai";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 120;

/** Ask the recording a question; the answer comes back with timecodes. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const { id } = await params;

    const body = (await req.json()) as { question?: string };
    const question = body.question?.trim();
    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const transcript = await getTranscript(id);
    if (!transcript) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const segments = await listSegments(id);
    if (segments.length === 0) {
      return NextResponse.json(
        { error: "This transcript has no text yet" },
        { status: 409 }
      );
    }

    const answer = await answerQuestion(transcript, segments, question);
    return NextResponse.json(answer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not answer that";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
