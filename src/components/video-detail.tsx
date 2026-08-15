"use client";

import { useEffect, useState } from "react";
import {
  ArrowRightToLine,
  Clapperboard,
  Copy,
  Download,
  ExternalLink,
  Heart,
  Loader2,
  MessageSquarePlus,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { GenerationRecord, ProjectRecord } from "@/lib/types";

type GenerationComment = {
  id: string;
  generation_id: string;
  author: string;
  body: string;
  created_at: string;
};

type Props = {
  generation: GenerationRecord;
  onClose: () => void;
  onUsePrompt?: (g: GenerationRecord) => void;
  onOpenSource?: (generationId: string) => void;
  /** Attach this clip as a Seedance reference video (v2v edit/extend) */
  onEditVideo?: (g: GenerationRecord, intent: "edit" | "extend") => void;
  /** Open the video generation this clip was edited/extended from */
  onOpenSourceVideo?: (generationId: string) => void;
  projects?: ProjectRecord[];
  onMoveToProject?: (
    g: GenerationRecord,
    projectId: string | null
  ) => Promise<void>;
};

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
  onOpenSource,
  onEditVideo,
  onOpenSourceVideo,
  projects = [],
  onMoveToProject,
}: Props) {
  const [tab, setTab] = useState<"details" | "comments">("details");
  const [favorited, setFavorited] = useState(Boolean(g.is_favorite));
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [movingProject, setMovingProject] = useState(false);
  const [comments, setComments] = useState<GenerationComment[] | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("Studio");
  const [commentBusy, setCommentBusy] = useState(false);

  const videoUrl = g.output_url ?? "";
  const modelLabel = g.model_endpoint.replace(/^byteplus:|^fal:/, "");
  const currentProject = projects.find((p) => p.id === g.project_id);
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
      : [];
  const sourceGenerationId = payload.source_generation_id ?? null;
  const sourceVideoUrl = payload.source_video_url ?? null;
  const sourceVideoGenerationId = payload.source_video_generation_id ?? null;
  const durationS =
    g.duration_s != null ? Number(g.duration_s) : (payload.duration_s ?? null);

  // Reset per-generation state during render (React "previous render" pattern)
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const genKey = `${g.id}:${g.is_favorite}`;
  if (prevKey !== genKey) {
    setPrevKey(genKey);
    setFavorited(Boolean(g.is_favorite));
    if (!prevKey || prevKey.split(":")[0] !== g.id) {
      setComments(null);
      setCommentDraft("");
      setTab("details");
    }
  }

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

  return (
    // "dark" pins the player to dark styling even in the light theme —
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

      {/* Player */}
      <div className="relative flex min-w-0 flex-1 items-center justify-center p-6 md:p-10">
        {videoUrl ? (
          <video
            key={g.id}
            src={videoUrl}
            controls
            autoPlay
            loop
            playsInline
            className="max-h-[85vh] max-w-full rounded-lg shadow-2xl"
          />
        ) : (
          <p className="text-sm text-muted-foreground">No video</p>
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
              <IconBtn label="Copy prompt" onClick={() => void copyPrompt()}>
                <Copy className="size-4" />
              </IconBtn>
              <IconBtn
                label={favorited ? "Remove favorite" : "Favorite"}
                onClick={() => void toggleFavorite()}
                className={favorited ? "text-gold hover:text-gold" : undefined}
              >
                <Heart className={cn("size-4", favorited && "fill-current")} />
              </IconBtn>
              <IconBtn
                label="Open in new tab"
                onClick={() =>
                  window.open(videoUrl, "_blank", "noopener,noreferrer")
                }
              >
                <ExternalLink className="size-4" />
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
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saved in <span className="text-foreground">Library</span>
            </p>

            <section className="mt-5">
              <h3 className="mb-2 text-sm font-medium">Prompt</h3>
              <div className="max-h-36 overflow-y-auto rounded-xl bg-white/4 p-3 text-sm leading-relaxed text-foreground/90 ring-1 ring-white/6">
                {g.final_prompt}
              </div>
            </section>

            {sourceImageUrls.length > 0 && (
              <section className="mt-5">
                <h3 className="mb-2 text-sm font-medium">
                  {sourceImageUrls.length === 1
                    ? "Source image"
                    : "Source images"}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {sourceImageUrls.map((url, i) => {
                    const clickable =
                      i === 0 && sourceGenerationId && onOpenSource;
                    return (
                      <button
                        key={`${url}-${i}`}
                        type="button"
                        title={clickable ? "Open source image" : undefined}
                        onClick={() => {
                          if (clickable) onOpenSource(sourceGenerationId);
                        }}
                        className={cn(
                          "block overflow-hidden rounded-xl ring-1 ring-white/10",
                          clickable
                            ? "transition hover:ring-gold/50"
                            : "cursor-default"
                        )}
                      >
                        {url.startsWith("asset://") ? (
                          <span
                            title={url}
                            className="flex h-24 w-28 items-center justify-center px-2 text-center text-[11px] text-muted-foreground"
                          >
                            Verified asset
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={`Source image ${i + 1}`}
                            className="h-24 w-auto object-cover"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {sourceImageUrls.length === 1
                    ? "This clip was animated from a still (image → video)"
                    : "These references were blended into the clip"}
                </p>
              </section>
            )}

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
                    src={sourceVideoUrl}
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
                <Chip>${Number(g.cost).toFixed(3)}</Chip>
              </div>
              {onMoveToProject && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs text-muted-foreground">Project</p>
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
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                      {c.body}
                    </p>
                  </article>
                ))
              )}
            </div>

            <div className="border-t border-white/8 p-3">
              <p className="mb-2 px-0.5 text-[11px] text-muted-foreground">
                Team notes on this clip
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
