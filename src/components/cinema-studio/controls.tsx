"use client";

/**
 * Cinema Studio — the director controls above the prompt.
 *
 * Higgsfield's control chips ("Film setup · Auto", "Camera · Auto") as
 * popover pickers over Athar's existing preset lists. Every choice ends up
 * as a preset id in PromptInputs; the server's prompt compiler does the rest.
 */

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DirectorPreset } from "@/config/director";
import type { CameraPreset } from "@/config/camera";

/** Width classes in px, so the fixed panel can be clamped to the viewport. */
const WIDTH_PX: Record<string, number> = {
  "w-72": 288,
  "w-80": 320,
};

/**
 * A dock chip that opens an upward popover. Closes on outside click.
 *
 * The panel is portalled to <body> with fixed positioning — the dock sits
 * inside containers with overflow clipping AND backdrop filters, and a
 * filtered ancestor silently becomes the containing block for fixed
 * elements, throwing the panel off-screen. Rendering from the body sidesteps
 * both, the same way Radix portals its dropdowns.
 */
export function ChipPopover({
  label,
  value,
  active,
  icon,
  children,
  width = "w-80",
}: {
  /** The control's name — "Film setup". */
  label: string;
  /** The current selection — "Auto" or the preset label. */
  value: string;
  /** Anything non-default is active and reads gold. */
  active: boolean;
  icon?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(
    null
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelW = WIDTH_PX[width] ?? 320;
    setPos({
      // Clamp to the viewport so the last chips don't push the panel
      // off the right edge.
      left: Math.max(8, Math.min(rect.left, window.innerWidth - panelW - 8)),
      bottom: window.innerHeight - rect.top + 8,
    });
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      // The panel lives in a body portal — it is NOT inside wrapRef.
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    };
    // Fixed panels don't follow the page — reposition rather than drift.
    const onMove = () => place();
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          place();
          setOpen((o) => !o);
        }}
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition",
          active
            ? "border-gold/40 bg-gold/10"
            : "border-white/10 bg-white/5 hover:border-white/20",
          open && "border-gold/40"
        )}
      >
        {icon && (
          <span className={cn("shrink-0", active ? "text-gold" : "text-muted-foreground")}>
            {icon}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
            {label}
          </span>
          <span
            className={cn(
              "block max-w-28 truncate text-xs",
              active ? "text-gold" : "text-foreground"
            )}
          >
            {value}
          </span>
        </span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ left: pos.left, bottom: pos.bottom }}
            className={cn(
              "fixed z-[100] max-h-80 overflow-y-auto rounded-xl bg-popover p-2 shadow-2xl ring-1 ring-border",
              width
            )}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
}

/** One preset list inside a popover — label + description rows. */
export function PresetList({
  title,
  presets,
  value,
  onChange,
}: {
  title?: string;
  presets: (DirectorPreset | CameraPreset)[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      {title && (
        <p className="px-2 pt-1 pb-1.5 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          {title}
        </p>
      )}
      <div className="space-y-0.5">
        {presets.map((p) => {
          const selected = p.id === value;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition",
                selected ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
              )}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-sm",
                    selected && "text-gold"
                  )}
                >
                  {p.id === "raw" ? "Auto" : p.label}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {p.description}
                </span>
              </span>
              {selected && <Check className="size-3.5 shrink-0 text-gold" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The Emotion Wheel — presets arranged in a circle, Auto in the middle.
 * Same data as the flat list, but the wheel is the point: one glance, one
 * click, the way Higgsfield presents performance direction.
 */
export function EmotionWheel({
  presets,
  value,
  onChange,
}: {
  presets: DirectorPreset[];
  value: string;
  onChange: (id: string) => void;
}) {
  const ring = presets.filter((p) => p.id !== "raw");
  const radius = 96;

  return (
    <div className="relative mx-auto my-3 size-64">
      <button
        type="button"
        onClick={() => onChange("raw")}
        className={cn(
          "absolute top-1/2 left-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs transition",
          value === "raw"
            ? "border-gold/50 bg-gold/15 text-gold"
            : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/25"
        )}
      >
        Auto
      </button>
      {ring.map((p, i) => {
        const angle = (i / ring.length) * 2 * Math.PI - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const selected = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            title={p.description}
            onClick={() => onChange(p.id)}
            style={{
              left: `calc(50% + ${x}px)`,
              top: `calc(50% + ${y}px)`,
            }}
            className={cn(
              "absolute flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs transition",
              selected
                ? "border-gold/60 bg-gold/20 text-gold"
                : "border-white/10 bg-white/5 hover:border-white/25"
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

/** Montage pacing — four large cards, Higgsfield style, plus Auto. */
export function PacingCards({
  presets,
  value,
  onChange,
}: {
  presets: DirectorPreset[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {presets.map((p) => {
        const selected = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={cn(
              "rounded-xl border p-2.5 text-left transition",
              selected
                ? "border-gold/50 bg-gold/10"
                : "border-white/10 bg-white/5 hover:border-white/25"
            )}
          >
            <span className={cn("block text-sm", selected && "text-gold")}>
              {p.id === "raw" ? "Auto" : p.label}
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
              {p.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
