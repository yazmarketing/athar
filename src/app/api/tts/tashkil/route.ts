import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { diacritizeText, munsitApiConfigured } from "@/lib/munsit-tts";
import { NOT_CONFIGURED_MESSAGE } from "@/lib/tts-segments";

/** Auto-add Arabic diacritics before synthesizing — Athar's own addition. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    if (!munsitApiConfigured()) {
      return NextResponse.json(
        { error: NOT_CONFIGURED_MESSAGE },
        { status: 503 }
      );
    }

    const body = (await req.json()) as { text?: string };
    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "Nothing to diacritize" }, { status: 400 });
    }

    const diacritized = await diacritizeText(text);
    return NextResponse.json({ text: diacritized });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Diacritization failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
