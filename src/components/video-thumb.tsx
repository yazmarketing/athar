"use client";

import { useState } from "react";
import { Clapperboard, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { cssAspectRatio } from "@/config/aspects";

type Props = {
  src: string;
  className?: string;
  /** Output frame, e.g. "9:16". Defaults to 16:9. */
  aspect?: string | null;
  /** Play muted while the pointer is over the tile. */
  previewOnHover?: boolean;
};

/**
 * A clip in a grid.
 *
 * A bare <video> with no poster paints the browser's own placeholder — a grey
 * slab with a play glyph, which looks like a broken image. Seeking a hair past
 * the start gets a real frame on screen; the badge marks it as a clip; and a
 * clip that won't load says so instead of leaving an empty black box.
 */
export function VideoThumb({
  src,
  className,
  aspect,
  previewOnHover = true,
}: Props) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const frame = { aspectRatio: cssAspectRatio(aspect) };

  if (failed) {
    return (
      <div
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1.5 bg-muted/30 text-muted-foreground",
          className
        )}
        style={frame}
      >
        <Clapperboard className="size-5 opacity-60" />
        <span className="text-[11px]">Clip unavailable</span>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full overflow-hidden", className)} style={frame}>
      <video
        // #t=0.1 seeks just past the start so a real frame is painted —
        // without it Safari, and iOS especially, shows its own grey slab.
        src={`${src}#t=0.1`}
        className="absolute inset-0 size-full bg-black object-cover"
        playsInline
        muted
        loop
        preload="metadata"
        onLoadedData={() => setReady(true)}
        onError={() => setFailed(true)}
        onMouseEnter={(e) => {
          if (!previewOnHover) return;
          e.currentTarget.play().catch(() => {
            // Autoplay refused — the still frame is enough.
          });
        }}
        onMouseLeave={(e) => {
          if (!previewOnHover) return;
          const el = e.currentTarget;
          el.pause();
          el.currentTime = 0.1;
        }}
      />

      {/* Until a frame exists, a quiet placeholder rather than a black hole. */}
      {!ready && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/6 to-transparent" />
      )}

      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-black/45 ring-1 ring-white/25 backdrop-blur-sm transition group-hover:opacity-0">
          <Play className="size-4 translate-x-[1px] fill-white text-white" />
        </span>
      </span>
    </div>
  );
}
