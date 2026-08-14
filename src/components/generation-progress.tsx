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
  // Seedream stills — typically 10–25s
  image: [
    { atS: 0, label: "Reading your prompt…" },
    { atS: 3, label: "Blocking in the composition…" },
    { atS: 8, label: "Working on lighting and colour…" },
    { atS: 14, label: "Refining textures and details…" },
    { atS: 22, label: "Almost there — final polish…" },
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
  image: 10,
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
