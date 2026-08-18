"use client";

import { useEffect, useMemo, useRef } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { AtharLogo } from "@/components/athar-logo";
import { Button } from "@/components/ui/button";

/** Kept verbatim — this exact sentence is the moment. */
const MESSAGE = "You're all set — welcome to Athar";

type Piece = {
  left: number;
  delay: number;
  duration: number;
  size: number;
  drift: number;
  spin: number;
  opacity: number;
  round: boolean;
};

/**
 * Confetti geometry. Randomised once per opening so it never replays
 * identically, and generated in the browser only — this component is never
 * rendered on the server, so there is no hydration mismatch to worry about.
 */
function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, () => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.9,
    duration: 2.4 + Math.random() * 2.2,
    size: 4 + Math.random() * 7,
    drift: (Math.random() - 0.5) * 220,
    spin: (Math.random() - 0.5) * 900,
    opacity: 0.35 + Math.random() * 0.65,
    round: Math.random() > 0.6,
  }));
}

/**
 * The payoff for finishing onboarding. A dimmed stage, a burst of confetti,
 * the mark landing with a ring of light behind it, and the message arriving
 * one word at a time — instead of a toast sliding into the corner.
 *
 * Everything is CSS keyframes on transform/opacity, so it runs on the
 * compositor and costs nothing while it plays. `prefers-reduced-motion`
 * collapses the whole thing to a plain fade.
 */
export function WelcomeCelebration({
  open,
  onClose,
  onStart,
}: {
  open: boolean;
  /** Dismissed without pressing the button (scrim click or Esc). */
  onClose: () => void;
  /** The single way out: "Start creating" drops them on Home. */
  onStart: () => void;
}) {
  // New geometry per opening, so a replayed tour doesn't drop identical
  // confetti. Keyed off `open` rather than regenerated every render.
  //
  // `Math.random()` runs during render, which is only safe because this
  // never renders open on the server: the caller's `open` starts false and
  // is flipped by finishing the walkthrough. Mount it open on first paint and
  // the randomised inline styles will not survive hydration.
  const pieces = useMemo(() => (open ? makePieces(70) : []), [open]);
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the dialog so Enter does the obvious thing.
    const focus = window.setTimeout(() => startRef.current?.focus(), 700);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focus);
    };
  }, [open, onClose]);

  if (!open) return null;

  const words = MESSAGE.split(" ");

  return (
    <div
      className="dark fixed inset-0 z-[110] flex items-center justify-center overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={MESSAGE}
    >
      {/* Scrim. Clicking it dismisses — nothing here needs protecting. */}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/88 backdrop-blur-md animate-welcome-fade"
      />

      {/* Confetti sits above the scrim but below the card, and never eats
          clicks meant for the buttons. */}
      <div className="pointer-events-none absolute inset-0 motion-reduce:hidden">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="absolute top-[-8vh] block bg-white animate-welcome-confetti"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.round ? p.size : p.size * 2.4,
              borderRadius: p.round ? "9999px" : "1px",
              opacity: p.opacity,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              // Read by the keyframes so each piece drifts and spins its own way.
              ["--drift" as string]: `${p.drift}px`,
              ["--spin" as string]: `${p.spin}deg`,
            }}
          />
        ))}
      </div>

      {/* Expanding rings behind the mark — the "landing" of the moment. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center motion-reduce:hidden">
        {[0, 0.35, 0.7].map((delay) => (
          <span
            key={delay}
            className="absolute size-40 rounded-full border border-white/30 animate-welcome-ring"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
        <span className="absolute size-[32rem] rounded-full bg-white/[0.07] blur-3xl animate-welcome-glow" />
      </div>

      <div className="relative mx-4 w-full max-w-lg text-center animate-welcome-card">
        <div className="mb-7 flex justify-center animate-welcome-mark">
          <AtharLogo variant="stacked" height={128} priority />
        </div>

        {/* One word at a time. Splitting on spaces keeps the sentence exactly
            as written — the stagger is presentation only. */}
        <h2 className="text-balance text-2xl leading-tight font-semibold text-white sm:text-3xl">
          {words.map((word, i) => (
            <span
              key={`${word}-${i}`}
              className="inline-block animate-welcome-word"
              style={{ animationDelay: `${0.3 + i * 0.07}s` }}
            >
              {word}
              {i < words.length - 1 ? " " : ""}
            </span>
          ))}
        </h2>

        <div
          className="mt-8 flex flex-wrap items-center justify-center gap-2 animate-welcome-word"
          style={{ animationDelay: `${0.3 + words.length * 0.07 + 0.15}s` }}
        >
          <Button
            ref={startRef}
            onClick={onStart}
            className="h-11 gap-2 rounded-full bg-white px-7 text-black hover:bg-white/90"
          >
            <Sparkles className="size-4" />
            Start creating
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
