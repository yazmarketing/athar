import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AtharLogo } from "@/components/athar-logo";
import { friendlyModelName } from "@/config/models";
import { resolveShare } from "@/lib/shares";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

type Props = { params: Promise<{ token: string }> };

function isVideo(modeOrUrl: string) {
  return /t2v|i2v|v2v/.test(modeOrUrl) || /\.mp4($|\?)/.test(modeOrUrl);
}

/**
 * Preview card for Slack/WhatsApp/etc. Deliberately says nothing about the
 * client, project or prompt — a shared link shouldn't leak the brief.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return { title: "Not found" };

  const generation = await resolveShare(token);
  if (!generation) return { title: "Link unavailable" };

  const image = `/s/${token}/image`;
  return {
    title: "Shared from Athar",
    description: "A still from Athar, YAZ Media's AI film and image studio.",
    robots: { index: false, follow: false },
    openGraph: {
      type: "article",
      siteName: "Athar",
      title: "Shared from Athar",
      description: "A still from Athar, YAZ Media's AI film and image studio.",
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Shared from Athar",
      images: [image],
    },
  };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();

  const generation = await resolveShare(token);
  // Unknown, revoked and deleted all 404 identically, so a revoked link can't
  // be told apart from one that never existed.
  if (!generation) notFound();

  const src = `/s/${token}/image`;
  const video = isVideo(generation.mode) || isVideo(generation.output_url ?? "");

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-5">
        <AtharLogo height={34} priority />
        <a
          href="https://yazmedia.com"
          target="_blank"
          rel="noreferrer"
          className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase transition hover:text-foreground"
        >
          by YAZ Media
        </a>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-10">
        {video ? (
          <video
            src={src}
            controls
            playsInline
            className="max-h-[80vh] max-w-full rounded-xl shadow-2xl"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="Shared generation"
            className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl"
          />
        )}
      </main>

      <footer className="px-6 pb-8 text-center text-[11px] text-muted-foreground">
        {friendlyModelName(generation.model_endpoint)} ·{" "}
        {generation.aspect || "16:9"}
      </footer>
    </div>
  );
}
