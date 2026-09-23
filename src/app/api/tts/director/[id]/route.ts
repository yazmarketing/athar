import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import {
  getTtsDirectorAnalysis,
  listTtsDirectorSegments,
  listTtsDirectorTakesForAnalysis,
} from "@/lib/tts-director";

type Params = { params: Promise<{ id: string }> };

/** Full analysis + segments + takes, for resuming a Director Mode session. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const analysis = await getTtsDirectorAnalysis(id);
    if (!analysis) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const [segments, takesByS] = await Promise.all([
      listTtsDirectorSegments(id),
      listTtsDirectorTakesForAnalysis(id),
    ]);

    return NextResponse.json({
      analysis,
      segments: segments.map((s) => ({ ...s, takes: takesByS[s.id] ?? [] })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
