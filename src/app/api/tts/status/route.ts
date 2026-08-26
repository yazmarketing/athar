import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { munsitApiConfigured } from "@/lib/munsit-tts";
import { NOT_CONFIGURED_MESSAGE } from "@/lib/tts-segments";

/** Is text-to-speech configured? Mirrors /api/transcripts/status. */
export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configured = munsitApiConfigured();
  return NextResponse.json({
    configured,
    ok: configured,
    label: "Athar Voice",
    error: configured ? undefined : NOT_CONFIGURED_MESSAGE,
  });
}
