"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, X, Boxes } from "lucide-react";
import { cn } from "@/lib/utils";

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  ) {
    return list;
  }
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export type SortableThumb = {
  id: string;
  previewUrl: string | null;
  alt: string;
};

type Props = {
  items: SortableThumb[];
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onSave?: (index: number) => void;
  className?: string;
  sizeClassName?: string;
};

const DRAG_PX = 6;

/**
 * Numbered attachment thumbs. Drag to change @image order; click to view.
 * Pointer-based so it does not trip the dock's file-drop overlay.
 */
export function SortableThumbs({
  items,
  onReorder,
  onRemove,
  onSave,
  className,
  sizeClassName = "size-11",
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<SortableThumb | null>(null);
  const start = useRef<{
    x: number;
    y: number;
    id: string;
    dragging: boolean;
  } | null>(null);
  const nodes = useRef<Map<string, HTMLElement>>(new Map());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  const indexFromPoint = (x: number, y: number) => {
    for (const [id, el] of nodes.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return itemsRef.current.findIndex((item) => item.id === id);
      }
    }
    return -1;
  };

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, id, dragging: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.dragging && dx * dx + dy * dy < DRAG_PX * DRAG_PX) return;
    if (!s.dragging) {
      s.dragging = true;
      setDraggingId(s.id);
    }
    const from = itemsRef.current.findIndex((item) => item.id === s.id);
    const to = indexFromPoint(e.clientX, e.clientY);
    if (from < 0 || to < 0 || from === to) return;
    onReorderRef.current(from, to);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    setDraggingId(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!s || s.dragging) return;
    const item = itemsRef.current.find((row) => row.id === s.id);
    if (item) setViewing(item);
  };

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        {items.map((item, i) => (
          <div
            key={item.id}
            ref={(el) => {
              if (el) nodes.current.set(item.id, el);
              else nodes.current.delete(item.id);
            }}
            className={cn(
              "relative touch-none select-none",
              draggingId === item.id && "opacity-60"
            )}
          >
            <button
              type="button"
              title="Drag to reorder · click to view"
              aria-label={`View ${item.alt}`}
              onPointerDown={(e) => onPointerDown(e, item.id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                start.current = null;
                setDraggingId(null);
              }}
              className={cn(
                "block overflow-hidden rounded-lg ring-1 ring-white/10 transition",
                sizeClassName,
                draggingId === item.id
                  ? "cursor-grabbing ring-white/40"
                  : "cursor-grab hover:ring-white/30"
              )}
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.previewUrl}
                  alt={item.alt}
                  draggable={false}
                  className="size-full object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center bg-white/5 ring-1 ring-gold/30">
                  <ShieldCheck className="size-4 text-gold" />
                </span>
              )}
            </button>
            <span className="pointer-events-none absolute top-0.5 left-0.5 rounded bg-black/70 px-1 font-mono text-[9px] leading-4 text-white">
              {i + 1}
            </span>
            <button
              type="button"
              aria-label={`Remove ${item.alt}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(i);
              }}
              className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-foreground text-background shadow transition hover:scale-110"
            >
              <X className="size-2.5" />
            </button>
            {onSave && (
              <button
                type="button"
                aria-label="Save to library"
                title="Save to library"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSave(i);
                }}
                className="absolute -bottom-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-foreground text-background shadow transition hover:scale-110"
              >
                <Boxes className="size-2.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {viewing && (
        <div
          className="dark fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-6 text-foreground backdrop-blur-sm"
          onClick={() => setViewing(null)}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setViewing(null)}
          >
            <X className="size-5" />
          </button>
          {viewing.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={viewing.previewUrl}
              alt={viewing.alt}
              className="max-h-[88vh] max-w-full rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="flex flex-col items-center gap-3 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="flex size-20 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
                <ShieldCheck className="size-8 text-gold" />
              </span>
              <p className="text-sm text-muted-foreground">
                Preview isn&apos;t ready yet
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
