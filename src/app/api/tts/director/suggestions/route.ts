import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getLearnedDefaults } from "@/lib/tts-director";

/** Learning-loop read: a team preference hint, once enough selections exist. */
export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const voiceId = req.nextUrl.searchParams.get("voiceId")?.trim();
    if (!voiceId) {
      return NextResponse.json({ error: "voiceId is required" }, { status: 400 });
    }
    const emotion = req.nextUrl.searchParams.get("emotion")?.trim() || undefined;
    const pace = req.nextUrl.searchParams.get("pace")?.trim() || undefined;

    const suggestion = await getLearnedDefaults({ voiceId, emotion, pace });
    return NextResponse.json({ suggestion });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
