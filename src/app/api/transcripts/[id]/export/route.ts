import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getTranscript } from "@/lib/transcripts";
import {
  EXPORT_MIME,
  toCsv,
  toJsonExport,
  toMarkdown,
  toPlainText,
  toSrt,
  toVtt,
  type ExportFormat,
  type SubtitleSegment,
} from "@/lib/subtitles";

type Params = { params: Promise<{ id: string }> };

const FORMATS = new Set<ExportFormat>(["srt", "vtt", "txt", "md", "csv", "json"]);

/** "Ajman brand film" → "ajman-brand-film" */
function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9؀-ۿ]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "transcript"
  );
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const transcript = await getTranscript(id, { withSegments: true });
    if (!transcript) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const q = req.nextUrl.searchParams;
    const format = (q.get("format") ?? "srt").toLowerCase() as ExportFormat;
    if (!FORMATS.has(format)) {
      return NextResponse.json({ error: "Unknown format" }, { status: 400 });
    }

    const segments: SubtitleSegment[] = (transcript.segments ?? []).map((s) => ({
      start_s: s.start_s,
      end_s: s.end_s,
      text: s.text,
      speaker: s.speaker,
      words: s.words,
      translations: s.translations,
    }));

    const speakers = q.get("speakers") !== "false";
    const speakerNames = transcript.speaker_names ?? {};
    const bilingualLang = q.get("lang");
    const subtitleOptions = {
      speakers,
      speakerNames,
      bilingualLang,
      maxChars: Number(q.get("maxChars")) || undefined,
      maxLines: Number(q.get("maxLines")) || undefined,
      minDurationS: Number(q.get("minDuration")) || undefined,
      maxDurationS: Number(q.get("maxDuration")) || undefined,
    };
    const textOptions = {
      speakers,
      speakerNames,
      clean: q.get("clean") === "true",
      timestamps: (q.get("timestamps") ?? "speaker") as
        | "none"
        | "speaker"
        | "interval"
        | "segment",
      intervalS: Number(q.get("interval")) || undefined,
    };

    let body: string;
    switch (format) {
      case "srt":
        body = toSrt(segments, subtitleOptions);
        break;
      case "vtt":
        body = toVtt(segments, subtitleOptions);
        break;
      case "txt":
        body = toPlainText(segments, textOptions);
        break;
      case "md":
        body = toMarkdown(segments, { ...textOptions, title: transcript.title });
        break;
      case "csv":
        body = toCsv(segments, speakerNames);
        break;
      default:
        body = toJsonExport(segments, {
          title: transcript.title,
          language: transcript.language,
          duration_s: transcript.duration_s,
          model: transcript.model,
          speaker_names: speakerNames,
        });
    }

    const inline = q.get("inline") === "true";
    return new NextResponse(body, {
      headers: {
        "Content-Type": `${EXPORT_MIME[format]}; charset=utf-8`,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${slug(transcript.title)}.${format}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
