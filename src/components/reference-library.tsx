"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Check,
  Upload,
  SquarePen,
  ArrowUpToLine,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ReferenceAssetRecord } from "@/lib/types";

const KINDS = [
  { value: "character", label: "Character" },
  { value: "product", label: "Product" },
  { value: "brand", label: "Brand" },
  { value: "style", label: "Style" },
  { value: "reference", label: "Reference" },
] as const;

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  KINDS.map((k) => [k.value, k.label])
);

/** How many images one "Add references" batch can carry. */
const MAX_BATCH = 12;

/** An uploaded image waiting to be named and saved into the library. */
type Draft = { id: string; url: string; name: string; kind: string };

type Props = {
  /** Scope to a client (null = shared / all). */
  clientId?: string | null;
  /** "manage" = full CRUD panel; "picker" = click a card to select it. */
  mode: "manage" | "picker";
  /** picker: called with the chosen reference URL. */
  onPick?: (url: string, ref: ReferenceAssetRecord) => void;
  /** picker: URLs already attached, shown as selected. */
  selectedUrls?: string[];
  /** manage: projects (of the active client) to offer as a filter. */
  projects?: { id: string; name: string }[];
  /**
   * Reports whether a fetch is in flight, so a caller that renders this inside
   * a collapsible panel can put a spinner on the control that opened it.
   */
  onLoadingChange?: (loading: boolean) => void;
  /** Bump to refetch (e.g. after an upscale writes a new version). */
  reloadToken?: number;
  /** manage: open the shared Upscale dialog for this photo. */
  onUpscale?: (ref: ReferenceAssetRecord) => void;
  className?: string;
};

export function ReferenceLibrary({
  clientId,
  mode,
  onPick,
  selectedUrls = [],
  projects,
  onLoadingChange,
  reloadToken,
  onUpscale,
  className,
}: Props) {
  const [refs, setRefs] = useState<ReferenceAssetRecord[] | null>(null);
  /**
   * True while any fetch is in flight — including a re-filter, where `refs` is
   * already populated and the grid would otherwise sit showing stale results
   * with no sign that anything is happening.
   */
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [uploading, setUploading] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [versioningId, setVersioningId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const versionInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (clientId) params.set("clientId", clientId);
    if (filter !== "all") params.set("kind", filter);
    if (projectFilter !== "all") params.set("projectId", projectFilter);
    const qs = params.size ? `?${params.toString()}` : "";
    setLoading(true);
    onLoadingChange?.(true);
    try {
      const res = await fetch(`/api/reference-assets${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRefs(json.references as ReferenceAssetRecord[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
      setRefs([]);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [clientId, filter, projectFilter, onLoadingChange]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  async function uploadOne(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Upload failed");
    return json.url as string;
  }

  // Take a whole batch at once — a character set, a product line, a logo
  // pack — and stage each image as a draft to name before saving.
  async function onFiles(files: FileList | null) {
    const picked = Array.from(files ?? []);
    if (!picked.length) return;
    const images = picked.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (!images.length) {
      toast.error("Only JPEG, PNG, or WebP");
      return;
    }
    if (images.length < picked.length) {
      toast.error(
        `Skipped ${picked.length - images.length} file(s) — only JPEG, PNG, or WebP`
      );
    }
    const remaining = MAX_BATCH - drafts.length;
    if (remaining <= 0) {
      toast.error(`Up to ${MAX_BATCH} references at a time`);
      return;
    }
    const batch = images.slice(0, remaining);
    if (batch.length < images.length) {
      toast.error(`Only the first ${batch.length} added — ${MAX_BATCH} at a time`);
    }
    setUploading(true);
    try {
      const results = await Promise.all(
        batch.map(async (file) => {
          try {
            const url = await uploadOne(file);
            return { file, url, error: null as string | null };
          } catch (err) {
            return {
              file,
              url: null as string | null,
              error: err instanceof Error ? err.message : "Upload failed",
            };
          }
        })
      );
      const added = results
        .filter((r) => r.url)
        .map((r, i) => ({
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
          url: r.url as string,
          name: r.file.name.replace(/\.[^.]+$/, "").slice(0, 60),
          kind: drafts[drafts.length - 1]?.kind ?? "character",
        }));
      if (added.length) setDrafts((prev) => [...prev, ...added]);
      const failed = results.filter((r) => !r.url);
      if (failed.length) {
        toast.error(
          failed.length === 1
            ? `${failed[0].file.name}: ${failed[0].error}`
            : `${failed.length} images failed to upload`
        );
      }
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
    );
  }

  async function saveDrafts(e: React.FormEvent) {
    e.preventDefault();
    if (!drafts.length || drafts.some((d) => !d.name.trim())) return;
    setSaving(true);
    const failed: string[] = [];
    let savedCount = 0;
    let lastName = "";
    for (const draft of drafts) {
      try {
        const res = await fetch("/api/reference-assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim(),
            url: draft.url,
            kind: draft.kind,
            clientId: clientId ?? null,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        savedCount += 1;
        lastName = json.reference.name as string;
      } catch {
        failed.push(draft.id);
      }
    }
    // Keep whatever failed on screen so it can be retried without re-uploading.
    setDrafts((prev) => prev.filter((d) => failed.includes(d.id)));
    if (savedCount) {
      toast.success(
        savedCount === 1
          ? `Saved “${lastName}”`
          : `Saved ${savedCount} references`
      );
      void load();
    }
    if (failed.length) {
      toast.error(
        failed.length === 1
          ? "1 reference failed to save"
          : `${failed.length} references failed to save`
      );
    }
    setSaving(false);
  }

  async function archive(id: string) {
    try {
      const res = await fetch(`/api/reference-assets/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setRefs((prev) => prev?.filter((r) => r.id !== id) ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    }
  }

  async function saveRename(id: string) {
    const name = renameDraft.trim();
    setRenamingId(null);
    if (!name) return;
    try {
      const res = await fetch(`/api/reference-assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRefs(
        (prev) =>
          prev?.map((r) => (r.id === id ? { ...r, name } : r)) ?? null
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    }
  }

  // Replace an asset with a new image → bumps it to the next version and
  // archives the old one (kept as history).
  async function onVersionFile(files: FileList | null) {
    const file = files?.[0];
    const id = versioningId;
    setVersioningId(null);
    if (!file || !id) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error("Only JPEG, PNG, or WebP");
      return;
    }
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/upload", { method: "POST", body: form });
      const upJson = await up.json();
      if (!up.ok) throw new Error(upJson.error ?? "Upload failed");
      const res = await fetch(`/api/reference-assets/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: upJson.url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(`Updated to v${json.reference.version}`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Replace failed");
    } finally {
      if (versionInput.current) versionInput.current.value = "";
    }
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <input
        ref={versionInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onVersionFile(e.target.files)}
      />

      {/* toolbar: type + project filters + add */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[7rem] rounded-full border-border bg-card px-3 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {KINDS.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mode === "manage" && projects && projects.length > 0 && (
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-8 w-auto min-w-[8rem] rounded-full border-border bg-card px-3 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
          className="h-8 gap-1.5 rounded-full text-xs"
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          Add references
        </Button>
      </div>

      {/* draft bar (after an upload) — one row per staged image */}
      {drafts.length > 0 && (
        <form
          onSubmit={saveDrafts}
          className="flex flex-col gap-2 rounded-xl border border-gold/30 bg-gold-soft/50 p-2.5"
        >
          {drafts.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 px-0.5">
              <p className="text-xs text-muted-foreground">
                {drafts.length} images ready — name each one
              </p>
              <div className="flex-1" />
              <Select
                value="__set_all"
                onValueChange={(kind) =>
                  setDrafts((prev) => prev.map((d) => ({ ...d, kind })))
                }
              >
                <SelectTrigger className="h-8 w-auto min-w-[8rem] bg-card text-xs">
                  <span className="text-muted-foreground">Set all types…</span>
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {drafts.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={d.url}
                alt=""
                className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
              />
              <Input
                autoFocus={drafts.length === 1}
                placeholder="Name — e.g. Layla, Gold Tin"
                value={d.name}
                onChange={(e) => patchDraft(d.id, { name: e.target.value })}
                className="h-9 min-w-[10rem] flex-1 bg-card text-sm"
              />
              <Select
                value={d.kind}
                onValueChange={(kind) => patchDraft(d.id, { kind })}
              >
                <SelectTrigger className="h-9 w-auto min-w-[7rem] bg-card text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                aria-label="Discard this image"
                title="Discard"
                onClick={() =>
                  setDrafts((prev) => prev.filter((x) => x.id !== d.id))
                }
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}

          <div className="flex items-center justify-end gap-3 px-0.5">
            <button
              type="button"
              onClick={() => setDrafts([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || drafts.some((d) => !d.name.trim())}
              className="h-9 rounded-full bg-gold px-4 text-xs text-primary-foreground"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : drafts.length === 1 ? (
                "Save"
              ) : (
                `Save ${drafts.length}`
              )}
            </Button>
          </div>
        </form>
      )}

      {/* grid */}
      {refs === null ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading library…
        </div>
      ) : refs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No saved references yet
          {clientId ? " for this client" : ""}. Use{" "}
          <span className="text-foreground">Add references</span> to build a
          reusable set — the same face, product or logo, picked into any
          generation.
        </div>
      ) : (
        <div
          className={cn(
            "grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 md:grid-cols-4",
            loading && "pointer-events-none opacity-40"
          )}
        >
          {refs.map((r) => {
            const picked = selectedUrls.includes(r.url);
            const clickable = mode === "picker";
            return (
              <div
                key={r.id}
                className={cn(
                  "group relative overflow-hidden rounded-xl border bg-card ring-1 ring-transparent transition",
                  clickable && "cursor-pointer hover:ring-gold/50",
                  picked ? "border-gold" : "border-border"
                )}
                onClick={
                  clickable ? () => onPick?.(r.url, r) : undefined
                }
              >
                <div className="relative aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.url}
                    alt={r.name}
                    className="size-full object-cover"
                  />
                  {r.version > 1 && (
                    <span className="absolute top-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      v{r.version}
                    </span>
                  )}
                  {picked && (
                    <span className="absolute inset-0 flex items-center justify-center bg-gold/25">
                      <span className="flex size-7 items-center justify-center rounded-full bg-gold text-primary-foreground">
                        <Check className="size-4" />
                      </span>
                    </span>
                  )}
                  {mode === "manage" && (
                    <>
                      <button
                        type="button"
                        aria-label="Remove reference"
                        title="Remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          void archive(r.id);
                        }}
                        className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition hover:bg-black/80 group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                      <div className="absolute inset-x-1.5 bottom-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
                        {onUpscale && (
                          <button
                            type="button"
                            title="Upscale"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpscale(r);
                            }}
                            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-black/70 py-1.5 text-[11px] font-medium text-white backdrop-blur-sm transition hover:bg-black/85"
                          >
                            <ArrowUpToLine className="size-3.5" />
                            Upscale
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setVersioningId(r.id);
                            versionInput.current?.click();
                          }}
                          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-black/70 py-1.5 text-[11px] font-medium text-white backdrop-blur-sm transition hover:bg-black/85"
                        >
                          <Upload className="size-3.5" />
                          Replace
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div className="px-2.5 py-2">
                  {mode === "manage" && renamingId === r.id ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => void saveRename(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRename(r.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="w-full rounded-md border border-gold/40 bg-background px-1.5 py-0.5 text-xs text-foreground outline-none"
                    />
                  ) : (
                    <div className="flex items-center gap-1">
                      <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                        {r.name}
                      </p>
                      {mode === "manage" && (
                        <button
                          type="button"
                          aria-label="Rename"
                          title="Rename"
                          onClick={() => {
                            setRenamingId(r.id);
                            setRenameDraft(r.name);
                          }}
                          className="shrink-0 text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
                        >
                          <SquarePen className="size-3" />
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {KIND_LABEL[r.kind] ?? r.kind}
                    {r.version > 1 ? ` · v${r.version}` : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
