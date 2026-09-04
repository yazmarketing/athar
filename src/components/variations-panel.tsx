"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Images,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  imageModelChoice,
  imageModelCost,
  imageModelIdFromEndpoint,
} from "@/config/models";
import { ImageModelSelect } from "@/components/image-model-select";
import type {
  AspectRatio,
  GenerationRecord,
  ImageResolution,
  PromptInputs,
} from "@/lib/types";

export type VaryStrength = "subtle" | "medium" | "strong";

const ASPECTS: AspectRatio[] = ["16:9", "9:16", "1:1", "4:5", "21:9"];
const COUNTS = [2, 3, 4] as const;

const STRENGTH_COPY: Record<
  VaryStrength,
  { label: string; hint: string; nudge: string }
> = {
  subtle: {
    label: "Subtle",
    hint: "Keep seed · light changes",
    nudge:
      "Create a subtle variation of the reference image. Keep identity, wardrobe, pose, and composition nearly identical — only small natural differences in expression, fabric folds, or micro-lighting.",
  },
  medium: {
    label: "Medium",
    hint: "New seed · related look",
    nudge:
      "Create a clear variation of the reference image. Keep the same subject and overall look, but allow noticeable differences in pose, framing, or atmosphere while remaining recognizable as the same concept.",
  },
  strong: {
    label: "Strong",
    hint: "New seed · bolder reinterpretation",
    nudge:
      "Create a bold variation inspired by the reference image. Keep the core subject idea, but reinterpret camera angle, styling, or scene energy. Make the difference obvious.",
  },
};

type Props = {
  source: GenerationRecord;
  /** Library stills offered in the source picker */
  libraryImages?: GenerationRecord[];
  onSelectSource?: (g: GenerationRecord) => void;
  generating: boolean;
  onBack: () => void;
  onOpenDetail: (g: GenerationRecord) => void;
  onUseInAssistant: (g: GenerationRecord) => void;
  onGenerate: (args: {
    source: GenerationRecord;
    strength: VaryStrength;
    count: number;
    /** IMAGE_MODEL_CHOICES id — the caller maps it to tier / imageModel. */
    imageModelId: string;
    aspect: AspectRatio;
    resolution: ImageResolution;
    prompt: PromptInputs;
    seed?: number;
  }) => Promise<GenerationRecord[]>;
};

function promptFrom(g: GenerationRecord): PromptInputs {
  const stored = (g.input_payload as { prompt_inputs?: PromptInputs })
    .prompt_inputs;
  return stored ?? { subject: g.final_prompt };
}

function asAspect(value: string | undefined): AspectRatio {
  return ASPECTS.includes(value as AspectRatio)
    ? (value as AspectRatio)
    : "16:9";
}

export function VariationsPanel({
  source,
  libraryImages = [],
  onSelectSource,
  generating,
  onBack,
  onOpenDetail,
  onUseInAssistant,
  onGenerate,
}: Props) {
  const base = promptFrom(source);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [strength, setStrength] = useState<VaryStrength>("medium");
  const [count, setCount] = useState<(typeof COUNTS)[number]>(3);
  // Open on whatever made the original, so a re-roll starts from the same
  // model rather than a default.
  const [imageModelId, setImageModelId] = useState<string>(() =>
    imageModelIdFromEndpoint(
      source.model_endpoint,
      source.tier === "draft" ? "standard" : source.tier
    )
  );
  const [aspect, setAspect] = useState<AspectRatio>(asAspect(source.aspect));
  const [resolution, setResolution] = useState<ImageResolution>("1K");
  const [results, setResults] = useState<GenerationRecord[]>([]);

  const cost = useMemo(
    () => imageModelCost(imageModelId, resolution, count) ?? 0,
    [imageModelId, resolution, count]
  );

  const run = async () => {
    if (!source.output_url) {
      toast.error("Source image missing");
      return;
    }
    // Clear first: without this the previous batch stays on screen for the
    // whole run, the skeletons never show, and it reads as "stuck on the
    // same images" even though a new batch is being generated.
    setResults([]);
    try {
      const prompt: PromptInputs = {
        subject: [STRENGTH_COPY[strength].nudge, base.subject || source.final_prompt]
          .filter(Boolean)
          .join(" "),
        action: base.action,
        lighting: base.lighting,
        brandTokens: base.brandTokens,
        negativeAdditions: base.negativeAdditions,
      };
      const next = await onGenerate({
        source,
        strength,
        count,
        imageModelId,
        aspect,
        resolution,
        prompt,
        seed:
          strength === "subtle" && source.seed != null
            ? source.seed
            : undefined,
      });
      setResults(next);
      if (next.length === 0) {
        toast.error("No variations came back — try again");
      } else if (next.length < count) {
        // The API stops the batch on the first provider error and returns
        // what it already has; say so rather than quietly showing fewer.
        toast.warning(
          `Only ${next.length} of ${count} variations came back — the rest failed`
        );
      } else {
        toast.success(`${next.length} variations ready`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Variations failed");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* pr clears the floating notifications bell in the app's top-right */}
      <header className="flex items-center gap-3 border-b border-white/6 py-3 pr-16 pl-5">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="athar-headline">Variations</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            Compare takes from a source still
          </p>
        </div>
        {onSelectSource && libraryImages.length > 0 && (
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition",
              pickerOpen
                ? "border-gold/30 bg-gold/10 text-gold"
                : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
            )}
          >
            <Images className="size-3.5" />
            Switch image
          </button>
        )}
        <span className="hidden rounded-full bg-white/5 px-2.5 py-1 font-mono text-[10px] text-muted-foreground ring-1 ring-white/8 sm:inline">
          ~${cost.toFixed(3)}
        </span>
      </header>

      {pickerOpen && (
        <div className="border-b border-white/6 px-5 py-3">
          <p className="mb-2 text-[11px] text-muted-foreground">
            Choose a Library still to vary
          </p>
          <div className="grid max-h-40 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6 lg:grid-cols-8">
            {libraryImages.slice(0, 24).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  onSelectSource?.(g);
                  setPickerOpen(false);
                }}
                className={cn(
                  "overflow-hidden rounded-lg ring-1 transition",
                  g.id === source.id
                    ? "ring-gold"
                    : "ring-white/10 hover:ring-gold/50"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={g.output_url ?? ""}
                  alt=""
                  className="aspect-video w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 lg:flex-row">
        <aside className="w-full shrink-0 space-y-4 lg:w-72">
          <div className="overflow-hidden rounded-2xl bg-[#161616] ring-1 ring-white/8">
            {source.output_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={source.output_url}
                alt=""
                className="aspect-video w-full object-cover"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center text-xs text-muted-foreground">
                No preview
              </div>
            )}
            <div className="max-h-28 overflow-y-auto px-3 py-2">
              <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                {source.final_prompt}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium">Strength</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(STRENGTH_COPY) as VaryStrength[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStrength(s)}
                  className={cn(
                    "rounded-xl px-2 py-2 text-center ring-1 transition",
                    strength === s
                      ? "bg-gold/15 text-gold ring-gold/30"
                      : "bg-white/4 text-muted-foreground ring-white/8 hover:text-foreground"
                  )}
                >
                  <span className="block text-xs font-medium">
                    {STRENGTH_COPY[s].label}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {STRENGTH_COPY[strength].hint}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Select
              value={String(count)}
              onValueChange={(v) => setCount(Number(v) as (typeof COUNTS)[number])}
            >
              <SelectTrigger className="h-8 w-auto min-w-[4.5rem] rounded-full border-white/10 bg-white/5 px-3 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}×
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ImageModelSelect
              value={imageModelId}
              onChange={(id, choice) => {
                setImageModelId(id);
                if (!choice.resolutions.includes(resolution)) {
                  setResolution(choice.resolutions[choice.resolutions.length - 1]);
                }
              }}
              className="h-8 w-auto min-w-[8rem] rounded-full border-white/10 bg-white/5 px-3"
            />

            <Select
              value={aspect}
              onValueChange={(v) => setAspect(v as AspectRatio)}
            >
              <SelectTrigger className="h-8 w-auto min-w-[4.5rem] rounded-full border-white/10 bg-white/5 px-3 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECTS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={resolution}
              onValueChange={(v) => setResolution(v as ImageResolution)}
            >
              <SelectTrigger className="h-8 w-auto min-w-[3.5rem] rounded-full border-white/10 bg-white/5 px-3 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  imageModelChoice(imageModelId)?.resolutions ?? ["1K", "2K"]
                ).map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="h-10 w-full gap-1.5 rounded-xl bg-gold text-primary-foreground"
            disabled={generating || !source.output_url}
            onClick={() => void run()}
          >
            {generating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {generating ? "Generating" : `Generate ${count}`}
          </Button>
        </aside>

        <section className="min-w-0 flex-1">
          {results.length === 0 && !generating ? (
            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-2xl bg-[#121212] text-center ring-1 ring-white/6">
              <Sparkles className="mb-3 size-6 text-gold" />
              <p className="athar-headline">Compare grid</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Pick strength and count, then generate. Click a result to open
                details or send it to Assistant.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {generating &&
                results.length === 0 &&
                Array.from({ length: count }).map((_, i) => (
                  <div
                    key={`sk-${i}`}
                    className="flex aspect-video items-center justify-center rounded-2xl bg-[#161616] ring-1 ring-white/8"
                  >
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ))}
              {results.map((g) => (
                <article
                  key={g.id}
                  className="group overflow-hidden rounded-2xl bg-[#161616] ring-1 ring-white/8"
                >
                  <button
                    type="button"
                    className="block w-full"
                    onClick={() => onOpenDetail(g)}
                  >
                    {g.output_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.output_url}
                        alt=""
                        className="aspect-video w-full object-cover transition group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex aspect-video items-center justify-center text-xs text-muted-foreground">
                        No preview
                      </div>
                    )}
                  </button>
                  <div className="flex gap-2 p-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 flex-1 gap-1 bg-white/10 text-xs"
                      onClick={() => onOpenDetail(g)}
                    >
                      Open
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 flex-1 gap-1 bg-gold/90 text-xs text-primary-foreground hover:bg-gold"
                      onClick={() => onUseInAssistant(g)}
                    >
                      <Wand2 className="size-3" />
                      Use this
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
