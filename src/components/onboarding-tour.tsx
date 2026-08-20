"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Local mirror of the server's `users.onboarded_at`. It exists purely so a
 * returning user never sees a flash of the tour while the check is in flight —
 * the DB row is the source of truth. Bumping the suffix re-runs onboarding for
 * everyone, which is the intended way to reintroduce it after a significant UI
 * change (clear `users.onboarded_at` alongside it to replay it team-wide).
 */
const TOUR_STORAGE_KEY = "athar-onboarding-completed-v3";

/** Read the local mirror. Never throws — private mode has no storage. */
function readLocalTourCompleted(): boolean {
  try {
    return Boolean(localStorage.getItem(TOUR_STORAGE_KEY));
  } catch {
    return false;
  }
}

function writeLocalTourCompleted(done: boolean) {
  try {
    if (done) localStorage.setItem(TOUR_STORAGE_KEY, "1");
    else localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    // private mode — the server row still carries the answer
  }
}

/**
 * Should the walkthrough run for this sign-in?
 *
 * The local mirror short-circuits the common case. Otherwise ask the server:
 * a new browser, a private window or cleared storage must NOT replay a tour
 * the person already finished. A failed request answers "don't run it" —
 * showing the tour again is the worse failure.
 */
export async function shouldRunTour(): Promise<boolean> {
  if (readLocalTourCompleted()) return false;
  try {
    const res = await fetch("/api/me/onboarding", { cache: "no-store" });
    if (!res.ok) return false;
    const json = (await res.json()) as { completed?: boolean };
    if (json.completed) {
      // Seed the mirror so later loads skip the round trip.
      writeLocalTourCompleted(true);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Persist completion in both places. Fire-and-forget on the network half. */
export async function persistTourCompleted(): Promise<void> {
  writeLocalTourCompleted(true);
  try {
    await fetch("/api/me/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    // Offline — the mirror covers this browser; the next completion syncs it.
  }
}

export type TourStep = {
  /** Matches a `data-tour="…"` attribute in the app. */
  target: string;
  title: string;
  body: string;
  /** Preferred tooltip side; flips automatically when it won't fit. */
  placement?: "right" | "bottom" | "left" | "top";
  /**
   * Run when the step becomes active — used to put the app in the state where
   * the target actually exists (switching to Library before pointing at its
   * search box, for instance). Measurement retries until the anchor appears.
   */
  onEnter?: () => void;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const TOOLTIP_W_MAX = 340;
const TOOLTIP_MARGIN = 12;
const TOOLTIP_GAP = 14;

/**
 * Guided walkthrough. Dims the whole viewport with a single large
 * `box-shadow` spread and leaves the target element's rectangle clear — a
 * spotlight without needing an SVG mask, so it stays crisp at any zoom.
 *
 * Steps whose target isn't in the DOM (role-gated nav, collapsed panels) are
 * skipped automatically rather than pointing at nothing.
 */
export function OnboardingTour({
  steps,
  open,
  onClose,
}: {
  steps: TourStep[];
  open: boolean;
  /**
   * `completed` is true only when the user reaches the end and presses
   * "Complete onboarding". Skipping, Esc and clicking away all close the tour
   * *without* marking it done, so it returns on the next sign-in.
   */
  onClose: (completed: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Steps are taken as given. Availability is the caller's call (it knows
  // about roles and views); auto-skipping on "is it in the DOM right now?"
  // broke once steps could switch views to reveal their own target.
  const visibleSteps = steps;
  const total = visibleSteps.length;
  const step = visibleSteps[Math.min(index, Math.max(total - 1, 0))];
  const targetId = step?.target;

  const onEnter = step?.onEnter;

  // Put the app into the state this step needs (e.g. switch to Library)
  // before anything is measured.
  useEffect(() => {
    if (!open) return;
    onEnter?.();
  }, [open, onEnter]);

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    let attempts = 0;
    const timers: number[] = [];
    // Retry on a timer, not rAF, so a throttled tab still converges.
    const retry = () => {
      attempts += 1;
      timers.push(window.setTimeout(measure, 50));
    };

    // The DOM read and the resulting setState never run synchronously in the
    // effect body — they go through rAF, or a timer when rAF is throttled.
    //
    // `measure` is deliberately callable without rAF: a hidden or background
    // tab stops firing animation frames entirely, and a tour that only ever
    // measured inside rAF would sit there showing a dimmed screen with no
    // card on it. The settle timers below call this directly.
    const measure = () => {
        const el = targetId
          ? document.querySelector(`[data-tour="${targetId}"]`)
          : null;

        if (!el) {
          if (attempts < 40) {
            retry();
            return;
          }
          setRect(null);
          return;
        }


        const probe = el.getBoundingClientRect();
        // An anchor can exist but sit off-screen — the mobile sidebar is
        // translated out of view until its drawer opens. Highlighting that
        // draws the spotlight at negative coordinates, so wait for it.
        const offScreen =
          probe.width === 0 ||
          probe.height === 0 ||
          probe.right <= 0 ||
          probe.bottom <= 0 ||
          probe.left >= window.innerWidth ||
          probe.top >= window.innerHeight;
        if (offScreen && attempts < 40) {
          retry();
          return;
        }

        attempts = 0;
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        const r = el.getBoundingClientRect();
        setRect({
          top: r.top - PAD,
          left: r.left - PAD,
          width: r.width + PAD * 2,
          height: r.height + PAD * 2,
        });
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    schedule();

    // A step may animate the layout it points at — most notably the mobile
    // sidebar drawer, which slides in over ~200ms. Measuring once lands
    // mid-transition and the spotlight sits in the wrong place (or off
    // screen entirely), so re-measure until things settle.
    [80, 180, 300, 450, 650].forEach((ms) =>
      timers.push(window.setTimeout(measure, ms))
    );

    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(window.clearTimeout);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [open, targetId, steps]);

  /**
   * Finished the walkthrough. Persisting is the caller's job (it goes to the
   * server as well as localStorage), so this only reports the outcome.
   */
  const complete = useCallback(() => {
    setIndex(0);
    onClose(true);
  }, [onClose]);

  /** Closed early. Deliberately does NOT persist, so it reappears later. */
  const dismiss = useCallback(() => {
    setIndex(0);
    onClose(false);
  }, [onClose]);

  const next = useCallback(() => {
    setIndex((i) => (i + 1 >= total ? i : i + 1));
  }, [total]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss, next, back]);

  if (!open || !step || total === 0) return null;

  const isLast = index >= total - 1;
  const isFirst = index === 0;

  // Position the tooltip on the requested side, flipping when it would clip.
  const placement = step.placement ?? "right";
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Narrow screens get a card that fits with margins rather than one that
  // runs off the edge.
  const TOOLTIP_W = Math.min(TOOLTIP_W_MAX, vw - TOOLTIP_MARGIN * 2);

  let tipTop = 0;
  let tipLeft = 0;
  // For "top" the card is anchored by its BOTTOM edge via translateY(-100%),
  // so its height never has to be guessed — long copy can't overlap the
  // element being pointed at.
  let anchorFromBottom = false;

  if (rect) {
    const fitsRight = rect.left + rect.width + TOOLTIP_GAP + TOOLTIP_W < vw;
    const fitsLeft = rect.left - TOOLTIP_GAP - TOOLTIP_W > 0;
    // Enough clearance above for a tall card? Otherwise drop below instead.
    const fitsAbove = rect.top > 260;

    const side =
      placement === "right" && !fitsRight
        ? fitsLeft
          ? "left"
          : "bottom"
        : placement === "left" && !fitsLeft
          ? "right"
          : placement === "top" && !fitsAbove
            ? "bottom"
            : placement;

    if (side === "right") {
      tipLeft = rect.left + rect.width + TOOLTIP_GAP;
      tipTop = rect.top;
    } else if (side === "left") {
      tipLeft = rect.left - TOOLTIP_W - TOOLTIP_GAP;
      tipTop = rect.top;
    } else if (side === "top") {
      tipLeft = rect.left;
      tipTop = rect.top - TOOLTIP_GAP;
      anchorFromBottom = true;
    } else {
      tipLeft = rect.left;
      tipTop = rect.top + rect.height + TOOLTIP_GAP;
    }

    // Keep the card fully on screen horizontally; vertically only clamp the
    // top-anchored case, which measures downward from its own bottom edge.
    tipLeft = Math.max(12, Math.min(tipLeft, vw - TOOLTIP_W - 12));
    if (!anchorFromBottom) {
      tipTop = Math.max(12, Math.min(tipTop, vh - 280));
    }
  }

  return (
    <div className="dark fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      {/* Click-blocker only. Clicking the backdrop deliberately does nothing —
          leaving onboarding must be a deliberate act (Skip, or finish it), not
          something a stray click triggers. */}
      <div className="absolute inset-0" />

      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-gold transition-all duration-300 ease-out"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/72" />
      )}

      {/* Not rendered until the anchor is measured — otherwise the card
          appears at the top-left corner and visibly flies into position.
          From step 2 on, `rect` is already set, so it slides between
          anchors as intended. */}
      {rect && (
      <div
        className="absolute rounded-2xl bg-[#161616] p-4 text-foreground shadow-2xl ring-1 ring-white/10 transition-all duration-300 ease-out"
        style={{
          top: tipTop,
          left: tipLeft,
          width: TOOLTIP_W,
          transform: anchorFromBottom ? "translateY(-100%)" : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-gold" />
            <p className="text-sm font-medium">{step.title}</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Skip for now"
            title="Skip for now — this reopens next time you sign in"
            className="rounded-md p-1 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {step.body}
        </p>

        {/* Stacked, not side-by-side: with this many steps the dot row plus
            both buttons overflowed the card and pushed Next outside it. */}
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-1" aria-hidden>
            {visibleSteps.map((s, i) => (
              <span
                key={`${s.target}-${i}`}
                className={cn(
                  "h-1.5 shrink-0 rounded-full transition-all",
                  i === index ? "w-4 bg-gold" : "w-1.5 bg-white/20"
                )}
              />
            ))}
          </div>

          {/* Wraps: "Back" + "Complete onboarding" together exceed the card
              width, and without this the overflow spills outside the box. */}
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {!isFirst && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1 rounded-full border-white/10 bg-transparent px-2.5"
                onClick={back}
              >
                <ArrowLeft className="size-3.5" />
                Back
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 shrink-0 gap-1 rounded-full bg-gold px-2.5 text-primary-foreground hover:bg-gold/90"
              onClick={isLast ? complete : next}
            >
              {isLast ? (
                <>
                  <Check className="size-3.5" />
                  Complete onboarding
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="size-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>

        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Step {index + 1} of {total} · ← → to move · Esc to skip for now
        </p>
      </div>
      )}
    </div>
  );
}
