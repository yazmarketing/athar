import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AtharLogo } from "@/components/athar-logo";
import { friendlyModelName } from "@/config/models";
import { resolveShareContext, type ShareContext } from "@/lib/shares";
import type { GenerationRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

type Props = { params: Promise<{ token: string }> };

function isVideo(generation: GenerationRecord) {
  return (
    /t2v|i2v|v2v/.test(generation.mode) ||
    /\.mp4($|\?)/.test(generation.output_url ?? "")
  );
}

/** "Ajman Tourism · Ramadan 2026" — whichever of the two we know. */
function attribution(context: ShareContext): string | null {
  return (
    [context.clientName, context.projectName].filter(Boolean).join(" · ") || null
  );
}

/**
 * Preview card for Slack/WhatsApp/etc.
 *
 * Named after the work it shows — the client, and what the shot is — so a
 * link dropped in a thread reads as a specific piece of work rather than an
 * anonymous file. Favicon and the rest of the icon set are inherited from the
 * root layout, untouched.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return { title: "Not found" };

  const context = await resolveShareContext(token);
  if (!context) return { title: "Link unavailable" };

  const { generation } = context;
  const video = isVideo(generation);
  const noun = video ? "Film" : "Image";
  const who = attribution(context);

  // `title.template` on the root layout appends " · Athar".
  const title = who ? `${who} — ${noun}` : `${noun} from Athar`;
  // Deliberately generic: the prompt is our working material, and a share
  // link is often forwarded well past the people it was sent to.
  const description = `A ${video ? "clip" : "still"} from Athar, YAZ Media's AI film and image studio.`;

  const media = `/s/${token}/image`;
  // A clip has no poster frame to offer, so the card falls back to the Athar
  // card image and carries the video itself alongside it.
  const cardImage = video ? "/og/athar-og.png" : media;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: video ? "video.other" : "article",
      siteName: "Athar",
      title,
      description,
      images: [{ url: cardImage, alt: "Shared from Athar" }],
      ...(video
        ? { videos: [{ url: media, type: "video/mp4" }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [cardImage],
    },
  };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();

  const context = await resolveShareContext(token);
  // Unknown, revoked and deleted all 404 identically, so a revoked link can't
  // be told apart from one that never existed.
  if (!context) notFound();

  const { generation } = context;
  const src = `/s/${token}/image`;
  const video = isVideo(generation);
  const who = attribution(context);

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

      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-10">
        {video ? (
          <video
            src={src}
            controls
            playsInline
            className="max-h-[72vh] max-w-full rounded-xl shadow-2xl"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="Shared generation"
            className="max-h-[72vh] max-w-full rounded-xl object-contain shadow-2xl"
          />
        )}

        {who && (
          <p className="max-w-xl text-center text-[10px] tracking-[0.2em] text-gold uppercase">
            {who}
          </p>
        )}
      </main>

      <footer className="px-6 pb-8 text-center text-[11px] text-muted-foreground">
        {friendlyModelName(generation.model_endpoint)} ·{" "}
        {generation.aspect || "16:9"}
      </footer>
    </div>
  );
}
