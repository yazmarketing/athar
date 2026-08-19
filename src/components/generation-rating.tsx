"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { GenerationRecord } from "@/lib/types";

/**
 * Mirrors FEEDBACK_REASONS in lib/generation-feedback. Duplicated rather than
 * imported because that module is server-only (it pulls in the pool), and a
 * twelve-item list is cheaper to keep in step than a shared barrel.
 */
const REASONS = [
  { id: "ignored_prompt", label: "Ignored the prompt" },
  { id: "wrong_subject", label: "Wrong subject" },
  { id: "cultural_accuracy", label: "Culturally wrong" },
  { id: "face_wrong", label: "Face wrong / drifted" },
  { id: "anatomy", label: "Hands / anatomy" },
  { id: "text_or_logo", label: "Garbled text or logo" },
  { id: "composition", label: "Composition off" },
  { id: "lighting", label: "Lighting / colour off" },
  { id: "quality", label: "Soft or low quality" },
  { id: "off_brand", label: "Off-brand" },
  { id: "inconsistent", label: "Inconsistent with the set" },
  { id: "other", label: "Something else" },
] as const;

type Props = {
  generation: GenerationRecord;
  /** Larger hit targets for the detail panel; compact for a gallery card. */
  size?: "sm" | "md";
  /** Keeps the parent's copy of the record in step. */
  onRated?: (rating: 1 | -1 | null, reasons: string[], note: string) => void;
  className?: string;
};

/**
 * Thumbs on a generation, for the person who made it.
 *
 * A thumbs up is one click. A thumbs down asks why, because "this was bad" on
 * its own can't be acted on — the reasons are what make the export tell us
 * which part of the pipeline to change.
 */
export function GenerationRating({
  generation,
  size = "sm",
  onRated,
  className,
}: Props) {
  const { data: session } = useSession();
  const [rating, setRating] = useState<1 | -1 | null>(
    generation.my_rating ?? null
  );
  const [reasons, setReasons] = useState<string[]>(generation.my_reasons ?? []);
  const [note, setNote] = useState(generation.my_note ?? "");
  const [askOpen, setAskOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Only the person who made it. Someone else's verdict on your render is a
  // different question, and mixing the two would make the export unreadable.
  if (!session?.user?.id || generation.user_id !== session.user.id) return null;

  const iconSize = size === "md" ? "size-4" : "size-3.5";
  const btn = size === "md" ? "size-9" : "size-7";

  async function send(next: 1 | -1 | null, why: string[], text: string) {
    setSaving(true);
    try {
      const res =
        next === null
          ? await fetch(`/api/generations/${generation.id}/feedback`, {
              method: "DELETE",
            })
          : await fetch(`/api/generations/${generation.id}/feedback`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rating: next, reasons: why, note: text }),
            });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Could not save");
      }
      setRating(next);
      setReasons(why);
      setNote(text);
      onRated?.(next, why, text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const toggleUp = () => void send(rating === 1 ? null : 1, [], "");
  const openDown = () => {
    if (rating === -1) {
      void send(null, [], "");
      return;
    }
    setAskOpen(true);
  };

  return (
    <>
      <div className={cn("flex items-center gap-0.5", className)}>
        <button
          type="button"
          aria-label="Good result"
          title="Good result"
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            toggleUp();
          }}
          className={cn(
            "flex items-center justify-center rounded-md transition disabled:opacity-50",
            btn,
            rating === 1
              ? "bg-gold text-primary-foreground"
              : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
          )}
        >
          {saving && rating === 1 ? (
            <Loader2 className={cn(iconSize, "animate-spin")} />
          ) : (
            <ThumbsUp className={cn(iconSize, rating === 1 && "fill-current")} />
          )}
        </button>
        <button
          type="button"
          aria-label={rating === -1 ? "Clear rating" : "Not good — tell us why"}
          title={rating === -1 ? "Clear rating" : "Not good — tell us why"}
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            openDown();
          }}
          className={cn(
            "flex items-center justify-center rounded-md transition disabled:opacity-50",
            btn,
            rating === -1
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
          )}
        >
          <ThumbsDown
            className={cn(iconSize, rating === -1 && "fill-current")}
          />
        </button>
      </div>

      <Dialog open={askOpen} onOpenChange={setAskOpen}>
        <DialogContent
          className="sm:max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>What went wrong?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Pick everything that applies. This is collected across the team and
            read back as a whole, so the same problem reported ten times is what
            gets the pipeline changed.
          </p>

          <div className="mt-1 flex flex-wrap gap-1.5">
            {REASONS.map((r) => {
              const on = reasons.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() =>
                    setReasons((prev) =>
                      on ? prev.filter((x) => x !== r.id) : [...prev, r.id]
                    )
                  }
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs ring-1 transition",
                    on
                      ? "bg-gold text-primary-foreground ring-transparent"
                      : "text-muted-foreground ring-border hover:text-foreground"
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything specific? e.g. “the abaya is drawn as a cloak, and her face reads South Asian rather than Emirati”."
            className="mt-3 max-h-40 min-h-20 overflow-y-auto text-sm"
          />

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAskOpen(false)}>
              Cancel
            </Button>
            <Button
              className="gap-2 bg-gold text-primary-foreground hover:bg-gold/90"
              disabled={saving || reasons.length === 0}
              onClick={async () => {
                await send(-1, reasons, note);
                setAskOpen(false);
              }}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Send feedback
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
