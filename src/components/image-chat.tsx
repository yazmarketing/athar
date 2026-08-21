"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Aperture,
  Images,
  Loader2,
  Paperclip,
  Send,
  Shuffle,
  Sparkles,
  SunMedium,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { uploadImageFile } from "@/lib/upload-image";
import { GenerationPlaceholderCard } from "@/components/generation-progress";
import { ImageModelSelect } from "@/components/image-model-select";
import {
  imageModelChoice,
  imageModelCost,
  imageModelIdFromEndpoint,
  type Tier,
} from "@/config/models";
import type {
  AspectRatio,
  GenerationRecord,
  ImageResolution,
  PromptInputs,
} from "@/lib/types";

const ASPECTS: AspectRatio[] = ["16:9", "9:16", "1:1", "4:5", "21:9"];
const RESOLUTIONS: ImageResolution[] = ["1K", "2K"];
/**
 * Attachments per message, on top of the image being edited. Six plus the
 * base stays inside the eight references the edit request actually fuses.
 */
const MAX_EXTRA_REFS = 6;

const TOOL_CHIPS = [
  {
    id: "relight",
    label: "Relight",
    icon: SunMedium,
    fill: "Relight this image with dramatic cinematic lighting — warmer key light, softer fill, richer shadows. Keep subject identity, pose, and wardrobe unchanged.",
  },
  {
    id: "camera",
    label: "Change camera",
    icon: Aperture,
    fill: "Change the camera angle and lens feel — slightly lower angle, 50mm look, shallow depth of field. Keep the same subject identity and outfit.",
  },
  {
    id: "skin",
    label: "Soft skin",
    icon: Sparkles,
    fill: "Subtly enhance skin texture for a polished portrait finish — natural pores, soft specular highlights, no plastic look. Keep identity and wardrobe unchanged.",
  },
] as const;

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  imageUrl?: string | null;
  suggestions?: boolean;
};

export type AssistantEditArgs = {
  instruction: string;
  referenceUrl: string;
  extraReferenceUrls?: string[];
  basePrompt: PromptInputs;
  /** IMAGE_MODEL_CHOICES id — the caller maps it to tier / imageModel. */
  imageModelId: string;
  aspect: AspectRatio;
  resolution: ImageResolution;
};

export type AssistantCreateArgs = {
  prompt: PromptInputs;
  imageModelId: string;
  aspect: AspectRatio;
  resolution: ImageResolution;
  referenceUrls?: string[];
};

type Props = {
  generation: GenerationRecord | null;
  libraryImages?: GenerationRecord[];
  generating: boolean;
  onBack: () => void;
  onEdit: (args: AssistantEditArgs) => Promise<GenerationRecord | null>;
  onCreate: (args: AssistantCreateArgs) => Promise<GenerationRecord | null>;
  onVary?: (g: GenerationRecord) => void;
  onOpenDetail?: (g: GenerationRecord) => void;
  onSelectImage?: (g: GenerationRecord) => void;
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

export function ImageChat({
  generation,
  libraryImages = [],
  generating,
  onBack,
  onEdit,
  onCreate,
  onVary,
  onOpenDetail,
  onSelectImage,
}: Props) {
  const [current, setCurrent] = useState<GenerationRecord | null>(generation);
  const [draft, setDraft] = useState("");
  const [extraRefs, setExtraRefs] = useState<string[]>([]);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [improving, setImproving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Open on the model that made the image being edited.
  const [imageModelId, setImageModelId] = useState<string>(() =>
    imageModelIdFromEndpoint(
      generation?.model_endpoint,
      generation?.tier === "draft" || !generation
        ? "standard"
        : generation.tier
    )
  );
  const [aspect, setAspect] = useState<AspectRatio>(
    asAspect(generation?.aspect)
  );
  const [resolution, setResolution] = useState<ImageResolution>("1K");
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    generation?.output_url
      ? [
          {
            id: "sys",
            role: "system",
            text: "This is the Assistant — describe a change and it edits the current image, then keep iterating. For brand-new images, the Image Generator gives you looks, best-of-N and Smart mode.",
          },
          {
            id: "base",
            role: "assistant",
            text: "Starting image",
            imageUrl: generation.output_url,
            suggestions: true,
          },
        ]
      : [
          {
            id: "sys",
            role: "system",
            text: "Pick a still from Library to edit and refine it — or start a fresh one by describing it. Use the Image Generator for polished, best-of-N new images.",
          },
        ]
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const refFileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const selectedModelLabel =
    imageModelChoice(imageModelId)?.label ?? "Model";
  const cost = useMemo(
    () => imageModelCost(imageModelId, resolution, 1) ?? 0,
    [imageModelId, resolution]
  );
  const hasImage = Boolean(current?.output_url);

  useEffect(() => {
    setCurrent(generation);
    if (generation?.output_url) {
      setMessages([
        {
          id: "sys",
          role: "system",
          text: "This is the Assistant — describe a change and it edits the current image, then keep iterating. For brand-new images, the Image Generator gives you looks, best-of-N and Smart mode.",
        },
        {
          id: "base",
          role: "assistant",
          text: "Starting image",
          imageUrl: generation.output_url,
          suggestions: true,
        },
      ]);
      setImageModelId(
        imageModelIdFromEndpoint(
          generation.model_endpoint,
          generation.tier === "draft" ? "standard" : generation.tier
        )
      );
      setAspect(asAspect(generation.aspect));
    } else if (!generation) {
      setMessages([
        {
          id: "sys",
          role: "system",
          text: "Pick a still from Library to edit and refine it — or start a fresh one by describing it. Use the Image Generator for polished, best-of-N new images.",
        },
      ]);
    }
  }, [generation?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, generating]);

  const uploadReference = async (file: File) => uploadImageFile(file);

  const onReferenceFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const allowed = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ]);
    const list = Array.from(files).filter((f) => allowed.has(f.type));
    if (!list.length) {
      toast.error("Only JPEG, PNG, or WebP images");
      return;
    }
    const remaining = MAX_EXTRA_REFS - extraRefs.length;
    if (remaining <= 0) {
      toast.error(`Up to ${MAX_EXTRA_REFS} extra references`);
      return;
    }
    const batch = list.slice(0, remaining);
    setUploadingRef(true);
    try {
      const urls: string[] = [];
      for (const file of batch) {
        urls.push(await uploadReference(file));
      }
      setExtraRefs((prev) => [...prev, ...urls].slice(0, MAX_EXTRA_REFS));
      toast.success(
        urls.length === 1 ? "Reference added" : `${urls.length} references added`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingRef(false);
      if (refFileInput.current) refFileInput.current.value = "";
    }
  };

  const onComposerDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDragOver(true);
  };

  const onComposerDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragOver(false);
    }
  };

  const onComposerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onComposerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragOver(false);
    void onReferenceFiles(e.dataTransfer.files);
  };

  const improveDraft = async () => {
    if (!draft.trim() || improving) return;
    setImproving(true);
    try {
      const res = await fetch("/api/prompt/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "t2i",
          prompt: { subject: draft.trim() },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Improve failed");
      const next = json.prompt as PromptInputs;
      setDraft(
        [next.subject, next.action, next.lighting, next.brandTokens]
          .filter(Boolean)
          .join(". ")
      );
      toast.success("Prompt improved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Improve failed");
    } finally {
      setImproving(false);
    }
  };

  const send = async (instructionOverride?: string) => {
    const instruction = (instructionOverride ?? draft).trim();
    if (!instruction || generating) return;

    const attached = [...extraRefs];
    setDraft("");
    setExtraRefs([]);
    setMessages((m) => [
      ...m,
      {
        id: `u-${Date.now()}`,
        role: "user",
        text: instruction,
        imageUrl: attached[0] ?? null,
      },
    ]);

    let next: GenerationRecord | null = null;
    if (current?.output_url) {
      next = await onEdit({
        instruction,
        referenceUrl: current.output_url,
        extraReferenceUrls: attached.length > 0 ? attached : undefined,
        basePrompt: promptFrom(current),
        imageModelId,
        aspect,
        resolution,
      });
    } else {
      next = await onCreate({
        prompt: {
          subject: instruction,
        },
        imageModelId,
        aspect,
        resolution,
        referenceUrls: attached.length > 0 ? attached : undefined,
      });
    }

    if (!next?.output_url) {
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          text: "That didn’t work — see the toast for details, or try a clearer instruction.",
        },
      ]);
      return;
    }

    setCurrent(next);
    setMessages((m) => [
      ...m,
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: current?.output_url ? "Updated image" : "Created image",
        imageUrl: next.output_url,
        suggestions: true,
      },
    ]);
  };

  const applyChip = (fill: string) => {
    if (!hasImage) {
      toast.message("Open an image first");
      return;
    }
    setDraft(fill);
  };

  return (
    <div className="flex h-full min-h-0 flex-1">
      <section className="flex w-full max-w-md shrink-0 flex-col border-r border-white/6 bg-[#0f0f0f]">
        {/* pr clears the floating notifications bell in the app's top-right */}
        <header className="flex items-center gap-2 border-b border-white/6 py-3 pr-16 pl-4">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="athar-headline">Assistant</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              Refine an image by chatting — edit &amp; iterate step by step
            </p>
          </div>
          {libraryImages.length > 0 && (
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
              {hasImage ? "Switch image" : "Pick image"}
            </button>
          )}
        </header>

        {pickerOpen && (
          <div className="border-b border-white/6 px-3 py-3">
            <p className="mb-2 px-1 text-[11px] text-muted-foreground">
              Choose a Library still to edit
            </p>
            <div className="grid max-h-40 grid-cols-4 gap-2 overflow-y-auto">
              {libraryImages.slice(0, 24).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    onSelectImage?.(g);
                    setPickerOpen(false);
                  }}
                  className={cn(
                    "overflow-hidden rounded-lg ring-1 transition hover:ring-gold/40",
                    current?.id === g.id
                      ? "ring-gold/50"
                      : "ring-white/10"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.output_url!}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col gap-2",
                msg.role === "user" ? "items-end" : "items-start"
              )}
            >
              {msg.role === "system" ? (
                <p className="rounded-xl bg-white/4 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {msg.text}
                </p>
              ) : (
                <>
                  {msg.text && (
                    <p
                      className={cn(
                        "max-w-[90%] rounded-2xl px-3 py-2 text-sm",
                        msg.role === "user"
                          ? "bg-gold text-primary-foreground"
                          : "bg-white/8 text-foreground"
                      )}
                    >
                      {msg.text}
                    </p>
                  )}
                  {msg.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={msg.imageUrl}
                      alt=""
                      className="max-h-40 rounded-xl object-cover ring-1 ring-white/10"
                    />
                  )}
                  {msg.suggestions && current?.output_url && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="rounded-full bg-white/6 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-white/8 hover:text-foreground"
                        onClick={() => applyChip(TOOL_CHIPS[0].fill)}
                      >
                        Relight
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-white/6 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-white/8 hover:text-foreground"
                        onClick={() => onVary?.(current)}
                        disabled={!onVary}
                      >
                        Vary
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-white/6 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-white/8 hover:text-foreground"
                        onClick={() => onOpenDetail?.(current)}
                        disabled={!onOpenDetail}
                      >
                        Open detail
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {generating && (
            <div className="w-full max-w-[280px] space-y-1.5">
              <GenerationPlaceholderCard kind="image" aspect={aspect} />
              <p className="px-1 text-[11px] text-muted-foreground">
                Working with {selectedModelLabel}…
              </p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div
          className="relative border-t border-white/6 p-3"
          onDragEnter={onComposerDragEnter}
          onDragLeave={onComposerDragLeave}
          onDragOver={onComposerDragOver}
          onDrop={onComposerDrop}
        >
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2 text-center">
                <Paperclip className="size-5 text-gold" />
                <p className="text-sm font-medium">Drop reference image</p>
              </div>
            </div>
          )}

          <input
            ref={refFileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => onReferenceFiles(e.target.files)}
          />

          {hasImage && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {TOOL_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => applyChip(chip.fill)}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <chip.icon className="size-3" />
                  {chip.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void improveDraft()}
                disabled={improving || !draft.trim()}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {improving ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Wand2 className="size-3" />
                )}
                Improve prompt
              </button>
              {onVary && current && (
                <button
                  type="button"
                  onClick={() => onVary(current)}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-gold/25 bg-gold/10 px-2.5 text-[11px] text-gold"
                >
                  <Shuffle className="size-3" />
                  Variations
                </button>
              )}
            </div>
          )}

          <div className="mb-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={uploadingRef || extraRefs.length >= MAX_EXTRA_REFS}
              onClick={() => refFileInput.current?.click()}
              aria-label="Attach reference"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50",
                extraRefs.length > 0 && "border-gold/30 text-foreground"
              )}
            >
              {uploadingRef ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Paperclip className="size-3.5" />
              )}
              {extraRefs.length > 0 ? `${extraRefs.length} ref` : "Attach"}
            </button>

            <ImageModelSelect
              value={imageModelId}
              onChange={(id, choice) => {
                setImageModelId(id);
                if (!choice.resolutions.includes(resolution)) {
                  setResolution(choice.resolutions[choice.resolutions.length - 1]);
                }
              }}
              className="h-8 w-auto min-w-[8.5rem] rounded-full border-white/10 bg-white/5 px-3"
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
                {RESOLUTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="flex h-8 items-center px-1 font-mono text-[11px] text-muted-foreground">
              ~${cost.toFixed(3)}
            </span>
          </div>

          <div
            className={cn(
              "rounded-2xl bg-[#161616] p-2 ring-1 ring-white/8",
              dragOver && "ring-2 ring-gold/50"
            )}
          >
            {extraRefs.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2 px-1">
                {extraRefs.map((url) => (
                  <div
                    key={url}
                    className="group relative size-11 overflow-hidden rounded-lg border border-white/10 bg-black/40"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt="Reference"
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Remove reference"
                      onClick={() =>
                        setExtraRefs((prev) => prev.filter((u) => u !== url))
                      }
                      className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100"
                    >
                      <X className="size-3.5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={
                hasImage
                  ? "Describe the edit"
                  : "Describe the image"
              }
              rows={3}
              className="field-sizing-fixed h-24 max-h-24 min-h-24 resize-none overflow-y-auto border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
            />
            <div className="mt-1 flex items-center justify-between px-1">
              <span className="text-[10px] text-muted-foreground">
                ⌘/Ctrl + Enter
              </span>
              <Button
                size="sm"
                className="h-8 gap-1.5 rounded-full"
                disabled={generating || !draft.trim()}
                onClick={() => void send()}
              >
                {generating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                {hasImage ? "Apply edit" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="relative flex min-w-0 flex-1 flex-col bg-[#0b0b0b]">
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {hasImage ? "Current frame" : "New session"}
            </p>
            <p className="line-clamp-1 max-w-xl text-sm">
              {current?.final_prompt || "Describe the image"}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-muted-foreground ring-1 ring-white/8">
            <span className="text-foreground/80">{selectedModelLabel}</span>
            <span className="mx-1 text-white/20">·</span>
            {aspect} · {resolution}
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          {current?.output_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.output_url}
              alt={current.final_prompt}
              className="max-h-[min(70vh,720px)] max-w-full rounded-2xl object-contain shadow-2xl ring-1 ring-white/10"
            />
          ) : (
            <div className="flex flex-col items-center text-muted-foreground">
              <Sparkles className="mb-2 size-6 text-gold" />
              <p className="text-sm">Create your first frame in chat</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
