"use client";

import { useEffect, useState } from "react";
import {
  ArrowRightToLine,
  Clapperboard,
  Copy,
  Download,
  ExternalLink,
  Film,
  Heart,
  Loader2,
  RefreshCw,
  Share2,
  X,
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
import { ShareDialog, ShareOption } from "@/components/share-dialog";
import { GenerationRating } from "@/components/generation-rating";
import { cn } from "@/lib/utils";
import type {
  ClientRecord,
  GenerationRecord,
  ProjectRecord,
} from "@/lib/types";
import { friendlyModelName } from "@/config/models";

type Props = {
  generation: GenerationRecord;
  onClose: () => void;
  onUsePrompt?: (g: GenerationRecord) => void;
  /** Load prompt, settings, and attached media into Create without generating. */
  onReuse?: (g: GenerationRecord) => void;
  /** Keeps the gallery's copy of the record in step with a rating. */
  onRated?: (rating: 1 | -1 | null, reasons: string[], note: string) => void;
  onOpenSource?: (generationId: string) => void;
  /** Attach this clip as a Seedance reference video (v2v edit/extend) */
  onEditVideo?: (g: GenerationRecord, intent: "edit" | "extend") => void;
  /**
   * Attach this clip as a subject/motion/style reference for a fresh
   * generation — not an edit source, so duration/ratio stay free. Additive:
   * can be called more than once to build up a multi-reference set.
   */
  onAddReferenceVideo?: (g: GenerationRecord) => void;
  /** Open the video generation this clip was edited/extended from */
  onOpenSourceVideo?: (generationId: string) => void;
  projects?: ProjectRecord[];
  clients?: ClientRecord[];
  onMoveToProject?: (
    g: GenerationRecord,
    projectId: string | null
  ) => Promise<void>;
};

/** "4.2s" / "1m 18s" — render time, omitted when it wasn't recorded. */
function renderTime(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  const secs = ms / 1000;
  if (secs < 60) return `${secs < 10 ? secs.toFixed(1) : Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const r = Math.round(secs % 60);
  return r ? `${m}m ${r}s` : `${m}m`;
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

export function VideoDetail({
  generation: g,
  onClose,
  onUsePrompt,
  onReuse,
  onRated,
  onOpenSource,
  onEditVideo,
  onAddReferenceVideo,
  onOpenSourceVideo,
  projects = [],
  clients = [],
  onMoveToProject,
}: Props) {
  const [favorited, setFavorited] = useState(Boolean(g.is_favorite));
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [movingProject, setMovingProject] = useState(false);

  const videoUrl = g.output_url ?? "";
  const modelLabel = friendlyModelName(g.model_endpoint);
  // Who ran it. Falls back to the email's local part when no name is stored.
  const creatorLabel =
    g.creator_name?.trim() || g.creator_email?.split("@")[0] || null;
  const took = renderTime(g.render_ms);
  // Per-generation cost is hidden for now — flip to true to show it again.
  const SHOW_COST = false;
  const costLabel =
    SHOW_COST && g.cost != null && Number(g.cost) > 0
      ? `$${Number(g.cost).toFixed(3)}`
      : null;
  const currentProject = projects.find((p) => p.id === g.project_id);
  // A generation inherits its client through its project. Resolve by id and
  // fall back to the project's older freeform label for pre-existing rows.
  const currentClient =
    clients.find((c) => c.id === currentProject?.client_id)?.name ??
    currentProject?.client ??
    null;
  const payload = g.input_payload as {
    source_generation_id?: string;
    source_image_url?: string;
    source_image_urls?: string[];
    source_video_url?: string;
    source_video_generation_id?: string;
    duration_s?: number;
  };
  const sourceImageUrls = payload.source_image_urls?.length
    ? payload.source_image_urls
    : payload.source_image_url
      ? [payload.source_image_url]
      : (g.reference_urls ?? []).filter(Boolean);
  const sourceGenerationId = payload.source_generation_id ?? null;
  const sourceVideoUrl = payload.source_video_url ?? null;
  const sourceVideoGenerationId = payload.source_video_generation_id ?? null;
  const durationS =
    g.duration_s != null ? Number(g.duration_s) : (payload.duration_s ?? null);

  const [shareOpen, setShareOpen] = useState(false);
  const [assetPreviews, setAssetPreviews] = useState<Record<string, string>>(
    {}
  );
  const shareText = g.final_prompt.slice(0, 180);

  // Library cards store registered assets as asset://<id>, not a photo URL.
  // Resolve those ids to the BytePlus preview so the Prompt area can show
  // the still that was actually attached.
  useEffect(() => {
    const ids = sourceImageUrls
      .filter((url) => url.startsWith("asset://"))
      .map((url) => url.slice("asset://".length))
      .filter(Boolean);
    if (ids.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/assets");
        const json = (await res.json()) as {
          assets?: { id?: string; url?: string | null }[];
        };
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const a of json.assets ?? []) {
          if (a.id && a.url) next[a.id] = a.url;
        }
        setAssetPreviews(next);
      } catch {
        /* keep the text placeholder */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceImageUrls.join("|")]);

  const previewFor = (url: string) => {
    if (url.startsWith("asset://")) {
      return assetPreviews[url.slice("asset://".length)] ?? null;
    }
    return url;
  };

  // Reset per-generation state during render (React "previous render" pattern)
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const genKey = `${g.id}:${g.is_favorite}`;
  if (prevKey !== genKey) {
    setPrevKey(genKey);
    setFavorited(Boolean(g.is_favorite));
  }

  const toggleFavorite = async () => {
    if (busy) return;
    const next = !favorited;
    setFavorited(next);
    setBusy(true);
    try {
      const res = await fetch(`/api/generations/${g.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not update favorite");
      toast.success(next ? "Added to favorites" : "Removed from favorites");
    } catch (err) {
      setFavorited(!next);
      toast.error(err instanceof Error ? err.message : "Favorite failed");
    } finally {
      setBusy(false);
    }
  };


  const handleProjectChange = async (value: string) => {
    if (!onMoveToProject) return;
    setMovingProject(true);
    try {
      await onMoveToProject(g, value === "none" ? null : value);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Move failed");
    } finally {
      setMovingProject(false);
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

  const downloadMp4 = async () => {
    if (!videoUrl || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/download?url=${encodeURIComponent(videoUrl)}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          typeof json.error === "string" ? json.error : "Fetch failed"
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `athar-${g.id}.mp4`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Downloaded MP4");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    // "dark" pins the player to dark styling even in the light theme —
    // the media viewer is designed as a dark overlay
    <div className="dark fixed inset-0 z-50 flex flex-col overflow-y-auto bg-black/90 text-foreground backdrop-blur-sm md:flex-row md:overflow-hidden">
      <button
        type="button"
        aria-label="Close"
        // On desktop the Details header sits in this corner — size the
        // button to fit inside the header band instead of straddling its
        // bottom border.
        className="absolute top-4 right-4 z-20 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 md:top-2 md:right-3 md:p-1.5"
        onClick={onClose}
      >
        <X className="size-5 md:size-4" />
      </button>

      {/* Player */}
      <div className="relative flex min-w-0 shrink-0 items-center justify-center p-4 md:flex-1 md:shrink md:p-10">
        {videoUrl ? (
          <video
            key={g.id}
            src={videoUrl}
            controls
            autoPlay
            loop
            playsInline
            className="max-h-[52vh] max-w-full rounded-lg shadow-2xl md:max-h-[85vh]"
          />
        ) : (
          <p className="text-sm text-muted-foreground">No video</p>
        )}
      </div>

      {/* Right panel */}
      <aside className="flex w-full shrink-0 flex-col border-white/8 bg-[#141414] md:h-full md:max-w-md md:border-l">
        <div className="border-b border-white/8 px-4 py-3">
          <p className="text-sm font-medium text-foreground">Details</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <div className="mb-4 flex items-center gap-2">
              <IconBtn
                label={favorited ? "Remove favorite" : "Favorite"}
                onClick={() => void toggleFavorite()}
                className={favorited ? "text-gold hover:text-gold" : undefined}
              >
                <Heart className={cn("size-4", favorited && "fill-current")} />
              </IconBtn>
              {/* Was this what you asked for? Only shown to whoever made it. */}
              <GenerationRating generation={g} size="md" onRated={onRated} />
              <IconBtn
                label="Open in new tab"
                onClick={() =>
                  window.open(videoUrl, "_blank", "noopener,noreferrer")
                }
              >
                <ExternalLink className="size-4" />
              </IconBtn>
              <IconBtn
                label="Share"
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="size-4" />
              </IconBtn>

              <Button
                size="sm"
                variant="secondary"
                className="ml-auto h-9 gap-1.5 rounded-lg bg-white/10"
                disabled={!videoUrl || downloading}
                onClick={() => void downloadMp4()}
              >
                {downloading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                MP4
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              {timeAgo(g.created_at)}
              {creatorLabel && (
                <>
                  {" · by "}
                  <span className="text-foreground">{creatorLabel}</span>
                </>
              )}
              {took && (
                <>
                  {" · took "}
                  <span className="text-foreground">{took}</span>
                </>
              )}
              {costLabel && (
                <>
                  {" · "}
                  <span className="text-foreground">{costLabel}</span>
                </>
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saved in <span className="text-foreground">Library</span>
            </p>

            <section className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Prompt</h3>
                {/* Sits on the Prompt heading so it's unambiguous that this
                    copies the prompt, not the clip or its URL. */}
                <button
                  type="button"
                  onClick={() => void copyPrompt()}
                  title="Copy prompt"
                  aria-label="Copy prompt"
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
                >
                  <Copy className="size-3" />
                  Copy
                </button>
              </div>
              <div className="rounded-xl bg-white/4 p-3 ring-1 ring-white/6">
                {sourceImageUrls.length > 0 && (
                  <div className="mb-2.5 flex flex-wrap gap-2">
                    {sourceImageUrls.map((url, i) => {
                      const preview = previewFor(url);
                      const clickable =
                        i === 0 && sourceGenerationId && onOpenSource;
                      return (
                        <button
                          key={`${url}-${i}`}
                          type="button"
                          title={
                            clickable
                              ? "Open source image"
                              : url.startsWith("asset://")
                                ? "Verified asset"
                                : undefined
                          }
                          onClick={() => {
                            if (clickable) onOpenSource(sourceGenerationId);
                          }}
                          className={cn(
                            "block overflow-hidden rounded-lg ring-1 ring-white/10",
                            clickable
                              ? "transition hover:ring-gold/50"
                              : "cursor-default"
                          )}
                        >
                          {preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={preview}
                              alt={`Source image ${i + 1}`}
                              className="size-16 object-cover"
                            />
                          ) : (
                            <span className="flex size-16 items-center justify-center px-1 text-center text-[10px] leading-tight text-muted-foreground">
                              Asset
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="max-h-36 overflow-y-auto text-sm leading-relaxed text-foreground/90">
                  {g.final_prompt}
                </div>
              </div>
            </section>

            {sourceVideoUrl && (
              <section className="mt-5">
                <h3 className="mb-2 text-sm font-medium">Source video</h3>
                <button
                  type="button"
                  title={
                    sourceVideoGenerationId && onOpenSourceVideo
                      ? "Open source video"
                      : undefined
                  }
                  onClick={() => {
                    if (sourceVideoGenerationId && onOpenSourceVideo) {
                      onOpenSourceVideo(sourceVideoGenerationId);
                    }
                  }}
                  className={cn(
                    "block overflow-hidden rounded-xl ring-1 ring-white/10",
                    sourceVideoGenerationId && onOpenSourceVideo
                      ? "transition hover:ring-gold/50"
                      : "cursor-default"
                  )}
                >
                  <video
                    src={`${sourceVideoUrl}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-24 w-auto object-cover"
                  />
                </button>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  This clip was edited/extended from another video (video →
                  video)
                </p>
              </section>
            )}

            <section className="mt-5">
              <h3 className="mb-2 text-sm font-medium">Settings</h3>
              <div className="flex flex-wrap gap-2">
                {durationS != null && <Chip>{durationS}s</Chip>}
                <Chip>{g.aspect || "16:9"}</Chip>
                <Chip>{modelLabel}</Chip>
                <Chip className="capitalize">{g.tier}</Chip>
                <Chip className="uppercase">{g.mode}</Chip>
                {SHOW_COST && <Chip>${Number(g.cost).toFixed(3)}</Chip>}
              </div>
              {onMoveToProject && (
                <div className="mt-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    Project
                    {currentClient && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-foreground">{currentClient}</span>
                      </>
                    )}
                  </p>
                  <Select
                    value={g.project_id ?? "none"}
                    onValueChange={(v) => void handleProjectChange(v)}
                    disabled={movingProject}
                  >
                    <SelectTrigger className="h-9 w-full max-w-xs border-white/10 bg-white/5 text-xs">
                      <SelectValue>
                        {movingProject
                          ? "Moving…"
                          : (currentProject?.name ?? "No project")}
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
            </section>

            {/* Lighter type for the stacked action list (matches image detail) */}
            <div className="mt-auto space-y-2 pt-6 [&_button]:text-[11px] [&_button]:font-semibold [&_button]:tracking-[0.08em]">
              {onEditVideo && videoUrl && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    className="h-11 justify-between rounded-xl bg-white/10 hover:bg-white/15"
                    onClick={() => onEditVideo(g, "edit")}
                  >
                    <span className="flex items-center gap-2">
                      <Clapperboard className="size-4" />
                      Edit video
                    </span>
                    <span className="text-foreground/40">→</span>
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-11 justify-between rounded-xl bg-white/10 hover:bg-white/15"
                    onClick={() => onEditVideo(g, "extend")}
                  >
                    <span className="flex items-center gap-2">
                      <ArrowRightToLine className="size-4" />
                      Extend video
                    </span>
                    <span className="text-foreground/40">→</span>
                  </Button>
                </div>
              )}
              {onAddReferenceVideo && videoUrl && (
                <Button
                  variant="outline"
                  className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                  onClick={() => onAddReferenceVideo(g)}
                  title="Subject, motion or style reference for a fresh generation — not an edit source"
                >
                  <Film className="size-4" />
                  Add as reference
                </Button>
              )}
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                disabled={!videoUrl}
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="size-4" />
                Share
              </Button>
              {onReuse && (
                <Button
                  variant="outline"
                  className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                  onClick={() => onReuse(g)}
                >
                  <RefreshCw className="size-4" />
                  Reuse
                </Button>
              )}
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
            </div>
        </div>
      </aside>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        generationId={g.id}
        kind="video"
        shareText={shareText}
        mediaUrl={videoUrl}
        onCopyPrompt={() => void copyPrompt()}
        downloads={
          <ShareOption
            icon={<Download className="size-4" />}
            label="Download MP4"
            hint=".mp4"
            onClick={() => {
              void downloadMp4();
              setShareOpen(false);
            }}
          />
        }
      />
    </div>
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
