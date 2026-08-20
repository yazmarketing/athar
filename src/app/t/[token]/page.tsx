import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AtharLogo } from "@/components/athar-logo";
import { YazMediaLogo } from "@/components/yaz-media-logo";
import { SharedTranscript } from "@/components/shared-transcript";
import { formatClock } from "@/lib/subtitles";
import { getSharedTranscript } from "@/lib/transcripts";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return { title: "Not found" };
  const transcript = await getSharedTranscript(token);
  if (!transcript) return { title: "Link unavailable" };

  return {
    title: transcript.title || "Transcript",
    // A share link is often forwarded well past the people it was sent to, so
    // the preview says what it is and nothing about what was said.
    description: "A transcript from Athar, YAZ Media's AI film and image studio.",
    robots: { index: false, follow: false },
  };
}

export default async function SharedTranscriptPage({ params }: Props) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();

  const transcript = await getSharedTranscript(token);
  if (!transcript) notFound();

  const meta = [
    transcript.duration_s ? formatClock(transcript.duration_s) : null,
    transcript.language?.toUpperCase(),
    transcript.client_name,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-5 py-10">
      <header className="flex items-center justify-between">
        <AtharLogo className="h-6 w-auto" />
        <YazMediaLogo className="h-4 w-auto opacity-60" />
      </header>

      <div>
        <h1 className="text-lg font-medium">{transcript.title}</h1>
        {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
      </div>

      <SharedTranscript
        transcript={transcript}
        segments={transcript.segments ?? []}
      />
    </main>
  );
}
