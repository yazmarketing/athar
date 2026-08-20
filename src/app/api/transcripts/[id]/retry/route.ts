import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { getTranscript, updateTranscript } from "@/lib/transcripts";

type Params = { params: Promise<{ id: string }> };

/**
 * Reset a transcript so it can be run again.
 *
 * The audio lives in the browser, not here — it is decoded there and posted
 * chunk by chunk — so this only clears the row. The client re-reads the stored
 * media and replays the chunks against it.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const { id } = await params;

    const body = (await req.json().catch(() => ({}))) as {
      language?: string | null;
      task?: "transcribe" | "translate";
      vocabulary?: string;
    };

    const current = await getTranscript(id);
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const transcript = await updateTranscript(id, {
      status: "queued",
      progress: 0,
      stage: "",
      error: null,
      vocabulary: body.vocabulary,
      language: body.language !== undefined ? body.language : undefined,
    });
    return NextResponse.json({ transcript });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Retry failed";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 });
  }
}
