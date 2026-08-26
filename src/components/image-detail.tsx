"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpToLine,
  Boxes,
  ChevronDown,
  Clapperboard,
  Copy,
  Download,
  Eraser,
  ShieldCheck,
  Heart,
  Loader2,
  RefreshCw,
  Share2,
  Shuffle,
  SquarePen,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShareDialog, ShareOption } from "@/components/share-dialog";
import { GenerationRating } from "@/components/generation-rating";
import { cn } from "@/lib/utils";
import type {
  ClientRecord,
  GenerationRecord,
  ProjectRecord,
  PromptInputs,
} from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  friendlyModelName,
  BACKGROUND_REMOVE_MODEL,
} from "@/config/models";

type DownloadFormat = "png" | "jpeg" | "webp";

/** Sentinel for the "create one" row inside the project picker. */
const NEW_PROJECT = "__new_project__";

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
  /** Load prompt, settings, and attached media into Create without generating. */
  onReuse?: (g: GenerationRecord) => void;
  /** Keeps the gallery's copy of the record in step with a rating. */
  onRated?: (rating: 1 | -1 | null, reasons: string[], note: string) => void;
  onCreateVideo?: (g: GenerationRecord) => void;
  onVary?: (g: GenerationRecord) => void;
  onUpscale?: (g: GenerationRecord) => void;
  onSaveReference?: (g: GenerationRecord) => void;
  onRemoveBackground?: (g: GenerationRecord) => Promise<void>;
  onFavorite?: (g: GenerationRecord, isFavorite: boolean) => Promise<void>;
  projects?: ProjectRecord[];
  clients?: ClientRecord[];
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
  onReuse,
  onRated,
  onCreateVideo,
  onVary,
  onUpscale,
  onSaveReference,
  onRemoveBackground,
  onFavorite,
  projects = [],
  clients = [],
  onMoveToProject,
}: Props) {
  const [shareOpen, setShareOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [favorited, setFavorited] = useState(Boolean(g.is_favorite));
  const [busy, setBusy] = useState(false);
  const [movingProject, setMovingProject] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [addingAsset, setAddingAsset] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  /** Create a project and move this generation straight into it. */
  async function createAndMove(e: React.FormEvent) {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name || creatingProject) return;
    setCreatingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json: { error?: string; project?: { id: string } } =
        await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create project");
      const id = json.project?.id;
      if (id && onMoveToProject) await onMoveToProject(g, id);
      setNewProjectOpen(false);
      toast.success(`Moved to “${name}”`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create project");
    } finally {
      setCreatingProject(false);
    }
  }

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
        "Submitted — BytePlus is verifying the photo. It appears in the video dock's asset list once approved (about a minute)."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Asset upload failed");
    } finally {
      setAddingAsset(false);
    }
  }
  const [confirmBgOpen, setConfirmBgOpen] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const inputs = promptInputs(g);
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
  const imageUrl = g.output_url ?? "";
  const shareText = g.final_prompt.slice(0, 180);

  async function handleProjectChange(value: string) {
    if (value === NEW_PROJECT) {
      setNewProjectName("");
      setNewProjectOpen(true);
      return;
    }
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
  }, [g.id, g.is_favorite]);

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


  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(g.final_prompt);
      toast.success("Prompt copied");
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

  return (
    // "dark" pins the lightbox to dark styling even in the light theme —
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

      {/* Preview */}
      <div className="relative flex min-w-0 shrink-0 items-center justify-center p-4 md:flex-1 md:shrink md:p-10">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={g.final_prompt}
            className="max-h-[52vh] max-w-full rounded-lg object-contain shadow-2xl md:max-h-[85vh]"
          />
        ) : (
          <p className="text-sm text-muted-foreground">No image</p>
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
                <Heart
                  className={cn("size-4", favorited && "fill-current")}
                />
              </IconBtn>

              {/* Was this what you asked for? Only shown to whoever made it. */}
              <GenerationRating generation={g} size="md" onRated={onRated} />

              <div className="relative ml-auto" ref={downloadMenuRef}>
                <Button
                  size="sm"
                  className="h-9 gap-1.5 rounded-lg bg-white text-black hover:bg-white/90"
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
                    copies the prompt, not the image or its URL. */}
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
                      <SelectItem value={NEW_PROJECT}>＋ New project…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </section>

            {/* Lighter type for the stacked action list — the global button
                style (13px black caps) is too loud repeated 9x */}
            <div className="mt-auto space-y-2 pt-6 [&_button]:text-[11px] [&_button]:font-semibold [&_button]:tracking-[0.08em]">
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                onClick={() => {
                  if (onUsePrompt) {
                    onUsePrompt(g);
                    return;
                  }
                  void copyPrompt();
                  toast.message("Prompt copied");
                }}
              >
                <SquarePen className="size-4" />
                Use prompt
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
              {onSaveReference && (
                <Button
                  variant="outline"
                  className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                  onClick={() => onSaveReference(g)}
                >
                  <Boxes className="size-4" />
                  Save as reference
                </Button>
              )}
              {onRemoveBackground && (
                <Button
                  variant="outline"
                  className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                  disabled={removingBg}
                  onClick={() => setConfirmBgOpen(true)}
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
                title="Registers this face or product with BytePlus so video can hold the same identity across shots. Separate from the Library, which already has every generation."
                className="h-11 w-full justify-start gap-2 rounded-xl border-white/10 bg-transparent"
                disabled={addingAsset}
                onClick={() => void addToAssetLibrary()}
              >
                {addingAsset ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Register as video character
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
                disabled={!imageUrl}
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="size-4" />
                Share
              </Button>
            </div>
        </div>
      </aside>

      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="z-[60] max-w-sm border-white/10 bg-[#161616] text-foreground ring-white/10">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Creates the project and files this generation into it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createAndMove} className="space-y-3">
            <input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name"
              maxLength={120}
              className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm outline-none focus:border-gold/40"
            />
            <Button
              type="submit"
              disabled={creatingProject || !newProjectName.trim()}
              className="w-full bg-gold text-primary-foreground hover:bg-gold/90"
            >
              {creatingProject ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create and move here"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        generationId={g.id}
        kind="image"
        shareText={shareText}
        mediaUrl={imageUrl}
        onCopyPrompt={() => void copyPrompt()}
        downloads={DOWNLOAD_FORMATS.map((f) => (
          <ShareOption
            key={f.id}
            icon={<Download className="size-4" />}
            label={`Download ${f.label}`}
            hint={`.${f.ext}`}
            onClick={() => void downloadAs(f.id)}
          />
        ))}
      />

      {onRemoveBackground && (
        <ConfirmDialog
          open={confirmBgOpen}
          onOpenChange={setConfirmBgOpen}
          title="Remove the background?"
          description="Re-renders this image with the subject cut out onto plain white."
          cost={BACKGROUND_REMOVE_MODEL.costPerUnit}
          confirmLabel="Remove background"
          onConfirm={async () => {
            setRemovingBg(true);
            try {
              await onRemoveBackground(g);
            } finally {
              setRemovingBg(false);
            }
          }}
        />
      )}
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
