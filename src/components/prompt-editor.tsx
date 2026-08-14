"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, SquarePen, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PromptInputs } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "t2i" | "t2v";
  value: PromptInputs;
  onApply: (next: PromptInputs) => void;
};

export function PromptEditor({
  open,
  onOpenChange,
  mode,
  value,
  onApply,
}: Props) {
  const [draft, setDraft] = useState<PromptInputs>(value);
  const [improving, setImproving] = useState(false);
  const [instruction, setInstruction] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(value);
      setInstruction("");
    }
  }, [open, value]);

  const setField = <K extends keyof PromptInputs>(key: K, v: PromptInputs[K]) => {
    setDraft((prev) => ({ ...prev, [key]: v }));
  };

  const improve = async () => {
    if (!draft.subject?.trim()) {
      toast.error("Add a subject");
      return;
    }
    setImproving(true);
    try {
      const res = await fetch("/api/prompt/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt: draft,
          instruction: instruction.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Improve failed");
      setDraft(json.prompt as PromptInputs);
      toast.success("Prompt improved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Improve failed");
    } finally {
      setImproving(false);
    }
  };

  const apply = () => {
    if (!draft.subject?.trim()) {
      toast.error("Add a subject");
      return;
    }
    onApply({
      subject: draft.subject.trim(),
      action: draft.action?.trim() || undefined,
      lighting: draft.lighting?.trim() || undefined,
      brandTokens: draft.brandTokens?.trim() || undefined,
      negativeAdditions: draft.negativeAdditions?.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="z-[70] flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden border-white/10 bg-[#141414] p-0 text-foreground ring-white/10 sm:max-w-3xl md:max-w-4xl"
      >
        <DialogHeader className="shrink-0 border-b border-white/8 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="athar-headline flex items-center gap-2">
                <SquarePen className="size-4 shrink-0 text-gold" />
                Prompt editor
              </DialogTitle>
              <DialogDescription className="mt-1 text-muted-foreground">
                Structure a stronger prompt · AI improve uses ModelArk chat
              </DialogDescription>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-white/8 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 py-4">
          <Field label="Subject" hint="Who / what is in frame">
            <Textarea
              value={draft.subject}
              onChange={(e) => setField("subject", e.target.value)}
              rows={8}
              placeholder={
                mode === "t2v"
                  ? "Describe the shot"
                  : "Describe the subject"
              }
              className="min-h-40 resize-y border-white/8 bg-black/30 text-sm"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Action">
              <Input
                value={draft.action ?? ""}
                onChange={(e) => setField("action", e.target.value)}
                placeholder="Pose, gesture, camera move…"
                className="h-10 border-white/8 bg-black/30"
              />
            </Field>
            <Field label="Lighting">
              <Input
                value={draft.lighting ?? ""}
                onChange={(e) => setField("lighting", e.target.value)}
                placeholder="Soft key, golden hour…"
                className="h-10 border-white/8 bg-black/30"
              />
            </Field>
          </div>

          <Field label="Brand look">
            <Input
              value={draft.brandTokens ?? ""}
              onChange={(e) => setField("brandTokens", e.target.value)}
              placeholder="Premium tech aesthetic, deep blacks…"
              className="h-10 border-white/8 bg-black/30"
            />
          </Field>

          <Field label="Avoid (negative)" hint="Optional extras beyond global bans">
            <Input
              value={draft.negativeAdditions ?? ""}
              onChange={(e) => setField("negativeAdditions", e.target.value)}
              placeholder="extra fingers, plastic skin…"
              className="h-10 border-white/8 bg-black/30"
            />
          </Field>

          <div className="rounded-2xl bg-white/4 p-3 ring-1 ring-white/8">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-foreground">AI improve</p>
              <span className="font-mono text-[10px] text-muted-foreground">
                ModelArk
              </span>
            </div>
            <Input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Keep outfit exact"
              className="mb-2 h-9 border-white/8 bg-black/30 text-sm"
            />
            <Button
              type="button"
              variant="secondary"
              className="h-9 w-full gap-1.5 rounded-xl bg-gold/15 text-gold hover:bg-gold/25"
              disabled={improving || !draft.subject.trim()}
              onClick={() => void improve()}
            >
              {improving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {improving ? "Improving…" : "Improve with AI"}
            </Button>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/8 bg-[#141414] px-5 py-3">
          <p className="shrink-0 text-[11px] text-muted-foreground">⌘E to toggle</p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-white/10"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-gold whitespace-nowrap text-primary-foreground hover:bg-gold/90"
              onClick={apply}
            >
              Apply to dock
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {hint && (
          <span className={cn("text-[10px] text-muted-foreground")}>{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}
