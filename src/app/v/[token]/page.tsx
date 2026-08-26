import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AtharLogo } from "@/components/athar-logo";
import { YazMediaLogo } from "@/components/yaz-media-logo";
import { SharedVoice } from "@/components/shared-voice";
import { getSharedTtsGeneration } from "@/lib/tts";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return { title: "Not found" };
  const generation = await getSharedTtsGeneration(token);
  if (!generation) return { title: "Link unavailable" };

  return {
    title: generation.title || "Voice-over",
    // A share link is often forwarded well past the people it was sent to, so
    // the preview says what it is and nothing about what was said.
    description: "A voice-over from Athar, YAZ Media's AI film and image studio.",
    robots: { index: false, follow: false },
  };
}

export default async function SharedVoicePage({ params }: Props) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();

  const generation = await getSharedTtsGeneration(token);
  if (!generation) notFound();

  const meta = [
    generation.duration_s ? `${generation.duration_s.toFixed(1)}s` : null,
    generation.client_name,
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
        <h1 className="text-lg font-medium">{generation.title}</h1>
        {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
      </div>

      <SharedVoice generation={generation} token={token} />
    </main>
  );
}
