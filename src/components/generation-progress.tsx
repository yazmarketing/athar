"use client";

import { useEffect, useState } from "react";
import { Clapperboard, ImageIcon, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Progressive generation UX ("ChatGPT-style"). Providers send no real
 * progress, so stages are timed to typical render durations and the bar
 * eases asymptotically toward ~95% until the result actually lands.
 */

export type GenerationKind = "image" | "video" | "edit";

type Stage = { atS: number; label: string };

const STAGES: Record<GenerationKind, Stage[]> = {
  // Nano Banana Pro can take a minute-plus; Seedream usually lands sooner.
  image: [
    { atS: 0, label: "Reading your prompt…" },
    { atS: 8, label: "Blocking in the composition…" },
    { atS: 25, label: "Working on lighting and colour…" },
    { atS: 50, label: "Refining textures and details…" },
    { atS: 80, label: "Almost there — final polish…" },
  ],
  // Seedance renders — typically 2–8 min
  video: [
    { atS: 0, label: "Reading prompt & references…" },
    { atS: 20, label: "Blocking motion and camera path…" },
    { atS: 60, label: "Rendering frames…" },
    { atS: 150, label: "Generating audio & syncing…" },
    { atS: 280, label: "Final quality pass…" },
  ],
  // v2v edit/extend — the model first digests the source clip
  edit: [
    { atS: 0, label: "Analyzing the source clip…" },
    { atS: 25, label: "Mapping your change onto the motion…" },
    { atS: 70, label: "Rendering the edited frames…" },
    { atS: 160, label: "Matching light, grain and audio…" },
    { atS: 280, label: "Final consistency pass…" },
  ],
};

/** Time constant (s) for the eased bar — ~63% reached at tau. */
const TAU: Record<GenerationKind, number> = {
  image: 45,
  video: 140,
  edit: 140,
};

export function stageLabel(kind: GenerationKind, elapsedS: number): string {
  const stages = STAGES[kind];
  let label = stages[0].label;
  for (const s of stages) {
    if (elapsedS >= s.atS) label = s.label;
  }
  return label;
}

/** Asymptotic fake progress: fast start, slows down, never hits 100. */
export function easedProgress(kind: GenerationKind, elapsedS: number): number {
  return Math.min(0.95, 1 - Math.exp(-elapsedS / TAU[kind]));
}

export function ProgressBar({
  value,
  className,
}: {
  /** 0–1 */
  value: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-1 w-full overflow-hidden rounded-full bg-white/8",
        className
      )}
    >
      <div
        className="h-full rounded-full bg-gold transition-[width] duration-1000 ease-linear"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

/** Self-ticking elapsed seconds since `startedAtMs` (default: mount time). */
function useElapsedS(startedAtMs?: number) {
  const [mountedAt] = useState(() => Date.now());
  const origin = startedAtMs ?? mountedAt;
  const [elapsedS, setElapsedS] = useState(() =>
    Math.max(0, Math.round((Date.now() - origin) / 1000))
  );
  useEffect(() => {
    const t = setInterval(
      () => setElapsedS(Math.max(0, Math.round((Date.now() - origin) / 1000))),
      1000
    );
    return () => clearInterval(t);
  }, [origin]);
  return elapsedS;
}

/**
 * Placeholder card shown in the create view while a generation is in
 * flight — shimmering frame in the output aspect ratio with staged text.
 */
export function GenerationPlaceholderCard({
  kind,
  aspect,
  startedAtMs,
}: {
  kind: GenerationKind;
  aspect: string;
  /** Sync to a real start time (e.g. a durable job) — survives refresh */
  startedAtMs?: number;
}) {
  const elapsedS = useElapsedS(startedAtMs);
  const Icon =
    kind === "image" ? ImageIcon : kind === "edit" ? Wand2 : Clapperboard;
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl bg-card ring-1 ring-border"
      style={{ aspectRatio: aspect.replace(":", " / ") }}
    >
      <div className="absolute inset-0 animate-pulse bg-secondary" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-gold-soft ring-1 ring-gold/25">
          <Icon className="size-5 animate-pulse text-gold" />
        </div>
        <p
          key={stageLabel(kind, elapsedS)}
          className="animate-in fade-in text-sm font-medium text-foreground duration-500"
        >
          {stageLabel(kind, elapsedS)}
        </p>
        <p className="text-xs text-muted-foreground">{elapsedS}s</p>
        <ProgressBar
          value={easedProgress(kind, elapsedS)}
          className="max-w-[240px]"
        />
      </div>
    </div>
  );
}

/**
 * In-grid tile for a queued/running/failed job — sits next to finished
 * images instead of a separate text list.
 */
export function JobPlaceholderCard({
  kind,
  aspect,
  startedAtMs,
  status,
  prompt,
  error,
  cancelling,
  onCancel,
  onRetry,
  onDismiss,
}: {
  kind: GenerationKind;
  aspect: string;
  startedAtMs?: number;
  status: "queued" | "running" | "failed";
  prompt?: string;
  error?: string | null;
  cancelling?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const elapsedS = useElapsedS(startedAtMs);
  const failed = status === "failed";
  const label = failed
    ? (error?.trim() || "Failed")
    : stageLabel(kind, elapsedS);

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl bg-[#161616] ring-1 ring-white/8"
      style={{ aspectRatio: aspect.replace(":", " / ") }}
    >
      <div
        className={cn(
          "absolute inset-0",
          failed ? "bg-secondary/80" : "animate-pulse bg-secondary"
        )}
      />
      <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2.5">
        <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur-sm">
          {failed ? "Failed" : status === "queued" ? "Queued" : "Rendering"}
        </span>
        {failed ? (
          <div className="flex items-center gap-1">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm transition hover:bg-white/18"
              >
                Retry
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                aria-label="Dismiss"
                onClick={onDismiss}
                className="flex size-7 items-center justify-center rounded-full bg-black/45 text-white/70 backdrop-blur-sm transition hover:bg-black/60 hover:text-white"
              >
                ×
              </button>
            )}
          </div>
        ) : (
          onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm transition hover:bg-white/18 disabled:opacity-60"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          )
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 p-3">
        {prompt && (
          <p className="line-clamp-2 text-[12px] leading-snug text-white/80">
            {prompt}
          </p>
        )}
        <p className="text-[11px] text-white/45">
          {failed ? label : `${label} · ${elapsedS}s`}
        </p>
        {!failed && (
          <ProgressBar
            value={easedProgress(kind, elapsedS)}
            className="bg-white/10"
          />
        )}
      </div>
    </div>
  );
}
