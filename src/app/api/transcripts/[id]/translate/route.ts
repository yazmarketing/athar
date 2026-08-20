import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { getTranscript, listSegments, saveTranslations } from "@/lib/transcripts";
import { translateSegments } from "@/lib/transcript-ai";

type Params = { params: Promise<{ id: string }> };

/** Subtitle translation — the timings stay, only the words change. */
export const maxDuration = 600;

const LANGUAGE_NAMES: Record<string, string> = {
  ar: "Arabic",
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  hi: "Hindi",
  ur: "Urdu",
  tr: "Turkish",
  zh: "Chinese (Simplified)",
};

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const { id } = await params;

    const body = (await req.json()) as { lang?: string };
    const lang = body.lang?.trim().toLowerCase();
    if (!lang || !LANGUAGE_NAMES[lang]) {
      return NextResponse.json(
        { error: `Pick one of: ${Object.keys(LANGUAGE_NAMES).join(", ")}` },
        { status: 400 }
      );
    }

    const transcript = await getTranscript(id);
    if (!transcript) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const segments = await listSegments(id);
    if (segments.length === 0) {
      return NextResponse.json({ error: "Nothing to translate" }, { status: 409 });
    }

    const translations = await translateSegments(segments, LANGUAGE_NAMES[lang]);
    const written = await saveTranslations(id, lang, translations);
    return NextResponse.json({
      lang,
      translated: written,
      total: segments.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Translation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
