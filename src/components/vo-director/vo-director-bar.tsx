"use client";

import { Wand2, BookOpenCheck } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DELIVERY_TAGS, MAX_DELIVERY_TAGS } from "@/config/tts-director";
import { cn } from "@/lib/utils";

export type VoDirectorMode = "plain" | "quick" | "director";

export function ModeToggle({
  value,
  onChange,
}: {
  value: VoDirectorMode;
  onChange: (mode: VoDirectorMode) => void;
}) {
  const options: { id: VoDirectorMode; label: string }[] = [
    { id: "quick", label: "⚡ Quick Optimize" },
    { id: "director", label: "🎬 Director Mode" },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-white/5 p-1 ring-1 ring-white/10">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition",
            value === opt.id
              ? "bg-gold text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
      {value === "plain" && (
        <span className="px-2 text-[11px] text-muted-foreground">Skipping optimization</span>
      )}
    </div>
  );
}

type Props = {
  delivery: string[];
  onDeliveryChange: (ids: string[]) => void;
  dialect: "emirati" | "fusha";
  onDialectChange: (dialect: "emirati" | "fusha") => void;
  registerStrength: number;
  onRegisterStrengthChange: (value: number) => void;
  onOpenPronunciationEditor: () => void;
  onSkipToPlain: () => void;
  pronunciationEditorDisabled?: boolean;
};

/** Delivery tags, Dialect, Dialect Strength, and the Advanced disclosure. */
export function VoDirectorBar({
  delivery,
  onDeliveryChange,
  dialect,
  onDialectChange,
  registerStrength,
  onRegisterStrengthChange,
  onOpenPronunciationEditor,
  onSkipToPlain,
  pronunciationEditorDisabled,
}: Props) {
  const toggleTag = (id: string) => {
    if (delivery.includes(id)) {
      onDeliveryChange(delivery.filter((d) => d !== id));
      return;
    }
    if (delivery.length >= MAX_DELIVERY_TAGS) {
      onDeliveryChange([...delivery.slice(1), id]);
      return;
    }
    onDeliveryChange([...delivery, id]);
  };

  return (
    <div className="space-y-3 rounded-xl border border-white/8 bg-black/20 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Delivery</p>
          <div className="flex flex-wrap gap-1.5">
            {DELIVERY_TAGS.map((tag) => {
              const on = delivery.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs ring-1 transition",
                    on
                      ? "bg-gold text-primary-foreground ring-transparent"
                      : "text-muted-foreground ring-white/10 hover:text-foreground"
                  )}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Dialect</p>
          <Select value={dialect} onValueChange={(v) => onDialectChange(v as "emirati" | "fusha")}>
            <SelectTrigger size="sm" className="h-8 w-32 rounded-lg border-white/10 bg-black/25 px-2.5 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="emirati">🇦🇪 Emirati</SelectItem>
              <SelectItem value="fusha">🌐 MSA (Fus&apos;ha)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-40 flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Dialect strength
            </p>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={registerStrength}
            onChange={(e) => onRegisterStrengthChange(Number(e.target.value))}
            className="w-full accent-gold"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Natural</span>
            <span>Strong</span>
          </div>
        </div>
      </div>

      <details className="group text-xs">
        <summary className="cursor-pointer list-none text-[11px] text-muted-foreground select-none hover:text-foreground">
          Advanced
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-white/8 pt-2">
          <button
            type="button"
            disabled={pronunciationEditorDisabled}
            onClick={onOpenPronunciationEditor}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition hover:text-gold disabled:opacity-40"
          >
            <BookOpenCheck className="size-3.5" /> Pronunciation editor
          </button>
          <button
            type="button"
            onClick={onSkipToPlain}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            <Wand2 className="size-3.5" /> Skip optimization
          </button>
        </div>
      </details>
    </div>
  );
}
