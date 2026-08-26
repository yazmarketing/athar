import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { listMunsitModels, munsitApiConfigured } from "@/lib/munsit-tts";
import { NOT_CONFIGURED_MESSAGE } from "@/lib/tts-segments";

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!munsitApiConfigured()) {
      return NextResponse.json(
        { error: NOT_CONFIGURED_MESSAGE },
        { status: 503 }
      );
    }
    const models = await listMunsitModels();
    return NextResponse.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load models";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
