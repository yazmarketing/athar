"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpToLine,
  Bookmark,
  ChevronDown,
  Clapperboard,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  ShieldCheck,
  Heart,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquarePlus,
  Send,
  Share2,
  Shuffle,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { QcControls } from "@/components/qc-controls";
import type { GenerationRecord, ProjectRecord, PromptInputs } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DownloadFormat = "png" | "jpeg" | "webp";

type GenerationComment = {
  id: string;
  generation_id: string;
  author: string;
  body: string;
  created_at: string;
};

const DOWNLOAD_FORMATS: {
  id: DownloadFormat;
  label: string;
  ext: string;
  mime: string;
  quality?: number;
}[] = [
  { id: "png", label: "PNG", ext: "png", mime: "image/png" },
  { id: "jpeg", label: "JPEG", ext: "jpg", mime: "image/jpeg", quality: 0.92 },
  { id: "webp", label: "WebP", ext: "webp", mime: "image/webp", quality: 0.92 },
];

type Props = {
  generation: GenerationRecord;
  onClose: () => void;
  onEdit: (g: GenerationRecord) => void;
  onUsePrompt?: (g: GenerationRecord) => void;
  onCreateVideo?: (g: GenerationRecord) => void;
  onVary?: (g: GenerationRecord) => void;
  onUpscale?: (g: GenerationRecord) => void;
  onRemoveBackground?: (g: GenerationRecord) => Promise<void>;
  onQcChange?: (g: GenerationRecord) => void;
  onFavorite?: (g: GenerationRecord, isFavorite: boolean) => Promise<void>;
  onDelete?: (g: GenerationRecord) => Promise<void>;
  projects?: ProjectRecord[];
  onMoveToProject?: (
    g: GenerationRecord,
    projectId: string | null
  ) => Promise<void>;
};

function promptInputs(g: GenerationRecord): PromptInputs | null {
  return (
    (g.input_payload as { prompt_inputs?: PromptInputs }).prompt_inputs ?? null
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

async function encodeImageBlob(
  source: Blob,
  format: (typeof DOWNLOAD_FORMATS)[number]
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas unavailable");
  }
  if (format.id === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encode failed"))),
      format.mime,
      format.quality
    );
  });
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ImageDetail({
  generation: g,
  onClose,
  onEdit,
  onUsePrompt,
  onCreateVideo,
  onVary,
  onUpscale,
  onRemoveBackground,
  onQcChange,
  onFavorite,
  onDelete,
  projects = [],
  onMoveToProject,
}: Props) {
  const [tab, setTab] = useState<"details" | "comments">("details");
  const [shareOpen, setShareOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [favorited, setFavorited] = useState(Boolean(g.is_favorite));
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState<GenerationComment[] | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("Studio");
  const [commentBusy, setCommentBusy] = useState(false);
  const [movingProject, setMovingProject] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [addingAsset, setAddingAsset] = useState(false);

  async function addToAssetLibrary() {
    setAddingAsset(true);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId: g.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Asset upload failed");
      toast.success(
        "Added to BytePlus asset library — usable in videos once it's Active (a few minutes)"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Asset upload failed");
    } finally {
      setAddingAsset(false);
    }
  }
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const inputs = promptInputs(g);
  const modelLabel = g.model_endpoint.replace(/^byteplus:|^fal:/, "");
  const currentProject = projects.find((p) => p.id === g.project_id);
  const imageUrl = g.output_url ?? "";
  const shareText = g.final_prompt.slice(0, 180);

  async function handleProjectChange(value: string) {
    if (!onMoveToProject) return;
    setMovingProject(true);
    try {
      await onMoveToProject(g, value === "none" ? null : value);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Move failed");
    } finally {
      setMovingProject(false);
    }
  }

  useEffect(() => {
    setFavorited(Boolean(g.is_favorite));
    setComments(null);
    setCommentDraft("");
  }, [g.id, g.is_favorite]);

  useEffect(() => {
    if (tab !== "comments") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/generations/${g.id}/comments`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load comments");
        if (!cancelled) setComments(json.comments as GenerationComment[]);
      } catch (err) {
        if (!cancelled) {
          setComments([]);
          toast.error(
            err instanceof Error ? err.message : "Failed to load comments"
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, g.id]);

  useEffect(() => {
    if (!downloadOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (
        downloadMenuRef.current &&
        !downloadMenuRef.current.contains(e.target as Node)
      ) {
        setDownloadOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [downloadOpen]);

  const toggleFavorite = async () => {
    if (busy) return;
    const next = !favorited;
    setFavorited(next);
    setBusy(true);
    try {
      if (onFavorite) {
        await onFavorite(g, next);
      } else {
        const res = await fetch(`/api/generations/${g.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_favorite: next }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not update favorite");
      }
      toast.success(next ? "Added to favorites" : "Removed from favorites");
    } catch (err) {
      setFavorited(!next);
      toast.error(err instanceof Error ? err.message : "Favorite failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    const ok = window.confirm(
      "Delete this generation from Library? This cannot be undone."
    );
    if (!ok) return;
    setBusy(true);
    try {
      if (onDelete) {
        await onDelete(g);
      } else {
        const res = await fetch(`/api/generations/${g.id}`, {
          method: "DELETE",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Delete failed");
      }
      toast.success("Deleted");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const submitComment = async () => {
    const text = commentDraft.trim();
    if (!text || commentBusy) return;
    setCommentBusy(true);
    try {
      const res = await fetch(`/api/generations/${g.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: text,
          author: commentAuthor.trim() || "Studio",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not add comment");
      setComments((prev) => [...(prev ?? []), json.comment as GenerationComment]);
      setCommentDraft("");
      toast.success("Comment added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Comment failed");
    } finally {
      setCommentBusy(false);
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(g.final_prompt);
      toast.success("Prompt copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const copyUrl = async () => {
    if (!imageUrl) return;
    try {
      await navigator.clipboard.writeText(imageUrl);
      toast.success("Image URL copied");
      setShareOpen(false);
    } catch {
      toast.error("Copy failed");
    }
  };

  const downloadAs = async (formatId: DownloadFormat) => {
    if (!imageUrl || downloading) return;
    const format = DOWNLOAD_FORMATS.find((f) => f.id === formatId);
    if (!format) return;

    setDownloading(true);
    setDownloadOpen(false);
    try {
      const res = await fetch(
        `/api/download?url=${encodeURIComponent(imageUrl)}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          typeof json.error === "string" ? json.error : "Fetch failed"
        );
      }
      const source = await res.blob();
      const out = await encodeImageBlob(source, format);
      triggerBlobDownload(out, `athar-${g.id}.${format.ext}`);
      toast.success(`Downloaded as ${format.label}`);
      setShareOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setShareOpen(false);
  };

  const shareNative = async () => {
    if (!imageUrl || !navigator.share) {
      toast.message("Share unavailable");
      return;
    }
    try {
      await navigator.share({
        title: "Athar generation",
        text: shareText,
        url: imageUrl,
      });
      setShareOpen(false);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error("Share failed");
    }
  };

  const shareEmail = () => {
    if (!imageUrl) return;
    const subject = encodeURIComponent("Athar image");
    const body = encodeURIComponent(`${shareText}\n\n${imageUrl}`);
    openExternal(`mailto:?subject=${subject}&body=${body}`);
  };

  const shareX = () => {
    if (!imageUrl) return;
    const text = encodeURIComponent(`${shareText}\n${imageUrl}`);
    openExternal(`https://twitter.com/intent/tweet?text=${text}`);
  };

  const shareLinkedIn = () => {
    if (!imageUrl) return;
    openExternal(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(imageUrl)}`
    );
  };

  const shareWhatsApp = () => {
    if (!imageUrl) return;
    openExternal(
      `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${imageUrl}`)}`
    );
  };

  return (
    // "dark" pins the lightbox to dark styling even in the light theme —
    // the media viewer is designed as a dark overlay
    <div className="dark fixed inset-0 z-50 flex bg-black/90 text-foreground backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close"
        className="absolute top-4 right-4 z-20 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        onClick={onClose}
      >
        <X className="size-5" />
      </button>

      {/* Preview */}
      <div className="relative flex min-w-0 flex-1 items-center justify-center p-6 md:p-10">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={g.final_prompt}
            className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
          />
        ) : (
          <p className="text-sm text-muted-foreground">No image</p>
        )}
      </div>

      {/* Right panel */}
      <aside className="flex h-full w-full max-w-md shrink-0 flex-col border-l border-white/8 bg-[#141414]">
        <div className="flex gap-1 border-b border-white/8 p-3">
          {(["details", "comments"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm capitalize transition",
                tab === t
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "details" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <div className="mb-4 flex items-center gap-2">
              <IconBtn
                label="Copy prompt"
                onClick={() => void copyPrompt()}
              >
                <Copy className="size-4" />
              </IconBtn>
              <IconBtn
                label={favorited ? "Remove favorite" : "Favorite"}
                onClick={() => void toggleFavorite()}
                className={favorited ? "text-gold hover:text-gold" : undefined}
              >
                <Heart
                  className={cn("size-4", favorited && "fill-current")}
                />
              </IconBtn>
              <IconBtn
                label="Delete"
                onClick={() => void handleDelete()}
              >
                <Trash2 className="size-4" />
              </IconBtn>

              <div className="relative ml-auto" ref={downloadMenuRef}>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-9 gap-1.5 rounded-lg bg-white/10"
                  disabled={!imageUrl || downloading}
                  onClick={() => setDownloadOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={downloadOpen}
                >
                  {downloading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  Download
                  <ChevronDown
                    className={cn(
                      "size-3.5 opacity-70 transition",
                      downloadOpen && "rotate-180"
                    )}
                  />
                </Button>
                {downloadOpen && (
                  <div
                    role="menu"
                    className="absolute top-full right-0 z-30 mt-1.5 min-w-[9.5rem] overflow-hidden rounded-xl bg-[#1c1c1c] p-1 shadow-xl ring-1 ring-white/12"
                  >
                    {DOWNLOAD_FORMATS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-foreground/90 transition hover:bg-white/8"
                        onClick={() => void downloadAs(f.id)}
                      >
                        <span>{f.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          .{f.ext}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {timeAgo(g.created_at)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saved in <span className="text-foreground">Library</span>
            </p>

            <section className="mt-5">
              <h3 className="mb-2 text-sm font-medium">Prompt</h3>
              <div className="max-h-36 overflow-y-auto rounded-xl bg-white/4 p-3 text-sm leading-relaxed text-foreground/90 ring-1 ring-white/6">
                {g.final_prompt}
              </div>
              {inputs &&
                (Boolean(inputs.action?.trim()) ||
                  Boolean(inputs.lighting?.trim()) ||
                  Boolean(inputs.brandTokens?.trim())) && (
                  <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                    {inputs.action?.trim() && (
                      <MetaRow label="Action" value={inputs.action} />
                    )}
                    {inputs.lighting?.trim() && (
                      <MetaRow label="Lighting" value={inputs.lighting} />
                    )}
                    {inputs.brandTokens?.trim() && (
                      <MetaRow label="Brand look" value={inputs.brandTokens} />
                    )}
                  </div>
                )}
            </section>

            <section className="mt-5">
              <h3 className="mb-2 text-sm font-medium">Settings</h3>
              <div className="flex flex-wrap gap-2">
                <Chip>{g.aspect || "16:9"}</Chip>
                <Chip>{modelLabel}</Chip>
                <Chip className="capitalize">{g.tier}</Chip>
                {g.seed != null && <Chip>seed {g.seed}</Chip>}
                <Chip>${Number(g.cost).toFixed(3)}</Chip>
              </div>
              {onMoveToProject && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs text-muted-foreground">Project</p>
                  <Select
                    value={g.project_id ?? "none"}
                    onValueChange={handleProjectChange}
                    disabled={movingProject}
                  >
                    <SelectTrigger className="h-9 w-full max-w-xs border-white/10 bg-white/5 text-xs">
                      <SelectValue>
                        {movingProject
                          ? "Moving…"
                          : currentProject?.name ?? "No project"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.client ? ` · ${p.client}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <QcControls generation={g} onUpdated={onQcChange} />
            </section>

            {/* Lighter type for the stacked action list — the global button
                style (13px black caps) is too loud repeated 9x */}
            <div className="mt-auto space-y-2 pt-6 [&_button]:text-[11px] [&_button]:font-semibold [&_button]:tracking-[0.08em]">
              <Button
                className="h-11 w-full justify-between rounded-xl bg-white text-black hover:bg-white/90"
                onClick={() => {
                  if (onUsePrompt) {
                    onUsePrompt(g);
                    return;
                  }
                  void copyPrompt();
                  toast.message("Prompt copied");
                }}
              >
                Use prompt
                <span className="text-black/50">→</span>
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                onClick={() => onEdit(g)}
              >
                <Wand2 className="size-4" />
                Edit in Assistant
              </Button>
              {onVary && (
                <Button
                  variant="outline"
                  className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                  onClick={() => onVary(g)}
                >
                  <Shuffle className="size-4" />
                  Make variations
                </Button>
              )}
              {onUpscale && (
                <Button
                  variant="outline"
                  className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                  onClick={() => onUpscale(g)}
                >
                  <ArrowUpToLine className="size-4" />
                  Upscale
                </Button>
              )}
              {onRemoveBackground && (
                <Button
                  variant="outline"
                  className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                  disabled={removingBg}
                  onClick={async () => {
                    setRemovingBg(true);
                    try {
                      await onRemoveBackground(g);
                    } finally {
                      setRemovingBg(false);
                    }
                  }}
                >
                  {removingBg ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Eraser className="size-4" />
                  )}
                  Remove background
                </Button>
              )}
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                disabled={addingAsset}
                onClick={() => void addToAssetLibrary()}
              >
                {addingAsset ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Add to asset library
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                onClick={() =>
                  onCreateVideo
                    ? onCreateVideo(g)
                    : toast.message("Open Video Generator")
                }
              >
                <Clapperboard className="size-4" />
                Create video
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                onClick={() => toast.success("Saved")}
              >
                <Bookmark className="size-4" />
                Save to library
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                disabled={!imageUrl}
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="size-4" />
                Share
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {comments === null ? (
                <div className="flex items-center gap-2 py-10 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading comments…
                </div>
              ) : comments.length === 0 ? (
                <div className="rounded-2xl bg-white/4 px-4 py-8 text-center ring-1 ring-white/6">
                  <MessageSquarePlus className="mx-auto mb-3 size-6 text-gold" />
                  <p className="text-sm font-medium text-foreground">
                    No comments yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Leave a note for the team — feedback, client direction, or
                    what to try next.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {[
                      "Client approved",
                      "Needs revision",
                      "Use as reference",
                      "Too dark — brighten",
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCommentDraft(preset)}
                        className="rounded-full bg-white/6 px-3 py-1.5 text-[11px] text-muted-foreground ring-1 ring-white/8 transition hover:bg-white/10 hover:text-foreground"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                comments.map((c) => (
                  <article
                    key={c.id}
                    className="rounded-xl bg-white/4 px-3 py-2.5 ring-1 ring-white/6"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {c.author}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {timeAgo(c.created_at)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                      {c.body}
                    </p>
                  </article>
                ))
              )}
            </div>

            <div className="border-t border-white/8 p-3">
              <p className="mb-2 px-0.5 text-[11px] text-muted-foreground">
                Team notes on this generation
              </p>
              <Input
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
                placeholder="Your name"
                className="mb-2 h-9 border-white/8 bg-black/25 text-sm"
              />
              <div className="rounded-2xl bg-[#161616] p-2 ring-1 ring-white/8">
                <Textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      void submitComment();
                    }
                  }}
                  placeholder="Add a comment…"
                  rows={3}
                  className="field-sizing-fixed h-20 max-h-20 min-h-20 resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
                />
                <div className="mt-1 flex items-center justify-between px-1">
                  <span className="text-[10px] text-muted-foreground">
                    ⌘/Ctrl + Enter
                  </span>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 rounded-full"
                    disabled={commentBusy || !commentDraft.trim()}
                    onClick={() => void submitComment()}
                  >
                    {commentBusy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                    Add comment
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="z-[60] max-w-sm border-white/10 bg-[#161616] text-foreground ring-white/10">
          <DialogHeader>
            <DialogTitle>Share generation</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Copy, download, or send this image
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <ShareOption
              icon={<Share2 className="size-4" />}
              label="Share via device"
              hint="System share sheet"
              onClick={() => void shareNative()}
            />
            <ShareOption
              icon={<Link2 className="size-4" />}
              label="Copy image URL"
              onClick={() => void copyUrl()}
            />
            <ShareOption
              icon={<Copy className="size-4" />}
              label="Copy prompt"
              onClick={() => {
                void copyPrompt();
                setShareOpen(false);
              }}
            />
            {DOWNLOAD_FORMATS.map((f) => (
              <ShareOption
                key={f.id}
                icon={<Download className="size-4" />}
                label={`Download ${f.label}`}
                hint={`.${f.ext}`}
                onClick={() => void downloadAs(f.id)}
              />
            ))}
            <ShareOption
              icon={<ExternalLink className="size-4" />}
              label="Open in new tab"
              onClick={() => openExternal(imageUrl)}
            />
            <ShareOption
              icon={<Mail className="size-4" />}
              label="Email"
              onClick={shareEmail}
            />
            <ShareOption
              icon={<MessageCircle className="size-4" />}
              label="WhatsApp"
              onClick={shareWhatsApp}
            />
            <ShareOption
              icon={<XLogo />}
              label="Share on X"
              onClick={shareX}
            />
            <ShareOption
              icon={<LinkedInLogo />}
              label="Share on LinkedIn"
              onClick={shareLinkedIn}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShareOption({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/8"
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-white/6 text-foreground ring-1 ring-white/8">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-foreground">{label}</span>
        {hint && (
          <span className="block text-[11px] text-muted-foreground">{hint}</span>
        )}
      </span>
    </button>
  );
}

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

function LinkedInLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function Chip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full bg-white/6 px-2.5 py-1 text-xs text-foreground/85 ring-1 ring-white/8",
        className
      )}
    >
      {children}
    </span>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground/70">{label}: </span>
      <span className="text-foreground/80">{value}</span>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  className,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "rounded-lg bg-white/6 p-2 text-muted-foreground ring-1 ring-white/8 transition hover:bg-white/10 hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}
