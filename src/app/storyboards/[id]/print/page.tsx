import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth-session";
import { getStoryboard } from "@/lib/storyboards";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Props = { params: Promise<{ id: string }> };

/**
 * The deliverable.
 *
 * A board is something a client is handed, not a grid in an app — so this is
 * a printable document: numbered panels, the action and the line beneath
 * each, camera notes, and the running duration. Print to PDF from here.
 */
export default async function StoryboardPrintPage({ params }: Props) {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) notFound();

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const full = await getStoryboard(id);
  if (!full) notFound();

  const { board, panels } = full;
  const drawn = panels.filter((p) => p.image_url);
  const totalDuration = panels.reduce(
    (sum, p) => sum + (p.duration_s ? Number(p.duration_s) : 0),
    0
  );

  return (
    <div className="min-h-dvh bg-white text-black">
      <div className="mx-auto max-w-[1000px] px-10 py-10 print:px-0 print:py-0">
        <header className="mb-8 flex items-end justify-between border-b border-black/15 pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {board.title}
            </h1>
            <p className="mt-1 text-xs text-black/55">
              {panels.length} panels · {board.aspect}
              {totalDuration > 0 ? ` · ${Math.round(totalDuration)}s` : ""}
            </p>
          </div>
          <PrintButton />
        </header>

        <div className="grid grid-cols-2 gap-x-8 gap-y-9">
          {panels.map((p) => (
            <article
              key={p.id}
              className="break-inside-avoid"
              style={{ pageBreakInside: "avoid" }}
            >
              <div className="relative overflow-hidden rounded border border-black/20 bg-black/5">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt={`Panel ${p.number}`}
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-[11px] text-black/40">
                    Not drawn
                  </div>
                )}
              </div>

              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-sm font-semibold">{p.number}</span>
                <span className="text-[10px] tracking-wider text-black/50 uppercase">
                  {p.shot_size} · {p.angle}
                  {p.lens ? ` · ${p.lens}` : ""}
                  {p.duration_s ? ` · ${Number(p.duration_s)}s` : ""}
                </span>
              </div>

              <p className="mt-1 text-[13px] leading-snug">{p.action}</p>
              {p.dialogue && (
                <p className="mt-1 text-[13px] leading-snug text-black/70 italic">
                  &ldquo;{p.dialogue}&rdquo;
                </p>
              )}
              {p.motion && (
                <p className="mt-1 text-[11px] text-black/55">
                  Camera: {p.motion}
                </p>
              )}
            </article>
          ))}
        </div>

        {drawn.length < panels.length && (
          <p className="mt-8 text-[11px] text-black/45">
            {panels.length - drawn.length} panel
            {panels.length - drawn.length === 1 ? " is" : "s are"} still to be
            drawn.
          </p>
        )}
      </div>
    </div>
  );
}
