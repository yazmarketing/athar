"use client";

import { useEffect, useRef, useState } from "react";
import { AtharLogo } from "@/components/athar-logo";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onDone: () => void;
};

/** Where each spark flies, in degrees around the mark. */
const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  angle: (360 / 14) * i + (i % 2 ? 12 : 0),
  distance: i % 3 === 0 ? 150 : i % 2 === 0 ? 120 : 96,
  delay: 120 + (i % 5) * 45,
  size: i % 4 === 0 ? 7 : i % 3 === 0 ? 5 : 3,
}));

/**
 * The end of onboarding.
 *
 * Finishing the walkthrough used to raise the same small toast as "image
 * saved" — the one moment worth marking, marked like a routine event. This
 * takes the screen for two seconds instead: the mark lands, light throws off
 * it, the line arrives, and it clears itself.
 *
 * Dismissable on click or Escape, and it respects reduced-motion by simply
 * fading in.
 */
export function WelcomeMoment({ open, onDone }: Props) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!open) return;
    setLeaving(false);
    const hold = window.setTimeout(() => setLeaving(true), 2600);
    const close = window.setTimeout(() => doneRef.current(), 3100);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") doneRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => onDone()}
      className={cn(
        "fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center overflow-hidden",
        "bg-black/80 backdrop-blur-md",
        leaving ? "animate-welcome-out" : "animate-welcome-in"
      )}
    >
      {/* Warmth behind the mark, so it reads as light rather than a panel. */}
      <div
        aria-hidden
        className="animate-welcome-glow pointer-events-none absolute size-[34rem] max-w-[90vw] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(197,160,89,0.30) 0%, rgba(197,160,89,0.10) 42%, transparent 68%)",
        }}
      />

      <div className="relative flex flex-col items-center">
        {/* Sparks, thrown outward from behind the mark. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {SPARKS.map((s, i) => (
            <span
              key={i}
              className="animate-welcome-spark absolute top-1/2 left-1/2 rounded-full bg-gold"
              style={
                {
                  width: s.size,
                  height: s.size,
                  animationDelay: `${s.delay}ms`,
                  "--spark-x": `${Math.cos((s.angle * Math.PI) / 180) * s.distance}px`,
                  "--spark-y": `${Math.sin((s.angle * Math.PI) / 180) * s.distance}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>

        <div className="animate-welcome-mark relative">
          <AtharLogo height={64} priority />
        </div>

        <p className="animate-welcome-line mt-7 max-w-[22rem] px-6 text-center text-lg font-medium text-balance text-foreground">
          You&rsquo;re all set — welcome to Athar
        </p>

        <span className="animate-welcome-hint mt-3 text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
          Tap to begin
        </span>
      </div>
    </div>
  );
}
