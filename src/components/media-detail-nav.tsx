"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Hide both arrows when the open item isn't in the current gallery. */
  show?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
};

/**
 * Previous / next chevrons over a media viewer, plus arrow-key support.
 * Disabled at the ends of the current gallery rather than wrapping, so
 * it is obvious when you have run out of items.
 */
export function MediaDetailNav({ show, onPrevious, onNext }: Props) {
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      if (e.key === "ArrowLeft") onPrevious?.();
      if (e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, onPrevious, onNext]);

  if (!show) return null;

  return (
    <>
      <NavArrow
        side="left"
        label="Previous item"
        onClick={onPrevious}
        disabled={!onPrevious}
      />
      <NavArrow
        side="right"
        label="Next item"
        onClick={onNext}
        disabled={!onNext}
      />
    </>
  );
}

function NavArrow({
  side,
  label,
  onClick,
  disabled,
}: {
  side: "left" | "right";
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/8 transition hover:bg-white/20 hover:text-white",
        side === "left" ? "left-2 md:left-4" : "right-2 md:right-4",
        disabled && "pointer-events-none opacity-25"
      )}
    >
      <Icon className="size-5" strokeWidth={1.75} />
    </button>
  );
}
