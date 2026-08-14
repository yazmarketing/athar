"use client";

import { useState } from "react";
import { ArrowUpToLine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { GenerationRecord } from "@/lib/types";

type Props = {
  /** One source = single upscale; multiple = batch with shared settings */
  sources: GenerationRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (results: GenerationRecord[]) => void;
};

export function UpscaleDialog({ sources, open, onOpenChange, onDone }: Props) {
  const [mode, setMode] = useState<"creative" | "precision">("creative");
  const [scale, setScale] = useState<2 | 4>(2);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; failed: number }>({
    done: 0,
    failed: 0,
  });

  const isBatch = sources.length > 1;

  const run = async () => {
    if (busy || sources.length === 0) return;
    setBusy(true);
    setProgress({ done: 0, failed: 0 });
    const results: GenerationRecord[] = [];
    let failed = 0;
    // Sequential on purpose — keeps provider load and cost predictable
    for (const source of sources) {
      try {
        const res = await fetch("/api/upscale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            generationId: source.id,
            mode,
            scale,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Upscale failed");
        results.push(json.generation as GenerationRecord);
      } catch (err) {
        failed += 1;
        if (!isBatch) {
          toast.error(err instanceof Error ? err.message : "Upscale failed");
        }
      }
      setProgress({ done: results.length, failed });
    }

    setBusy(false);
    if (results.length > 0) {
      toast.success(
        isBatch
          ? `Upscaled ${results.length}/${sources.length} images${
              failed > 0 ? ` — ${failed} failed` : ""
            }`
          : `Upscaled ${scale}× (${mode})`
      );
      onOpenChange(false);
      onDone(results);
    } else if (isBatch) {
      toast.error("Upscale failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="z-[60] w-[min(28rem,calc(100vw-2rem))] max-w-md min-w-0 overflow-hidden border-white/10 bg-[#161616] text-foreground ring-white/10 sm:max-w-md">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <ArrowUpToLine className="size-4 shrink-0 text-gold" />
            {isBatch ? `Upscale ${sources.length} images` : "Upscale image"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isBatch
              ? "One configuration applied to every selected image. Each result is a new Library entry."
              : "Creates a new Library entry — the original stays intact."}
          </DialogDescription>
        </DialogHeader>

        {isBatch ? (
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {sources.slice(0, 8).map((s) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={s.id}
                src={s.output_url ?? ""}
                alt=""
                className="size-14 rounded-lg object-cover ring-1 ring-white/10"
              />
            ))}
            {sources.length > 8 && (
              <span className="flex size-14 items-center justify-center rounded-lg bg-white/5 text-xs text-muted-foreground ring-1 ring-white/10">
                +{sources.length - 8}
              </span>
            )}
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sources[0]?.output_url ?? ""}
            alt="Source"
            className="max-h-40 w-full max-w-full min-w-0 rounded-xl object-cover ring-1 ring-white/10"
          />
        )}

        <div className="min-w-0 space-y-4">
          <div className="min-w-0">
            <p className="mb-1.5 text-xs text-muted-foreground">Mode</p>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              {(
                [
                  {
                    id: "creative",
                    label: "Creative",
                    hint: "Richer texture & detail",
                  },
                  {
                    id: "precision",
                    label: "Precision",
                    hint: "Stay close to the original",
                  },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "min-w-0 rounded-xl border px-3 py-2.5 text-left transition",
                    mode === m.id
                      ? "border-gold/50 bg-gold-soft/60"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  )}
                >
                  <span className="block truncate text-sm font-medium">
                    {m.label}
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {m.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <p className="mb-1.5 text-xs text-muted-foreground">Scale</p>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              {([2, 4] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScale(s)}
                  className={cn(
                    "min-w-0 rounded-xl border px-3 py-2 text-sm transition",
                    scale === s
                      ? "border-gold/50 bg-gold-soft/60 font-medium"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>

        <Button
          className="h-11 w-full min-w-0 whitespace-normal rounded-xl bg-gold text-primary-foreground hover:bg-gold/90"
          disabled={busy}
          onClick={() => void run()}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {isBatch
                ? `Upscaling ${progress.done + progress.failed + 1}/${sources.length}…`
                : "Upscaling — usually under a minute…"}
            </>
          ) : isBatch ? (
            `Upscale ${sources.length} images ${scale}×`
          ) : (
            `Upscale ${scale}×`
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
