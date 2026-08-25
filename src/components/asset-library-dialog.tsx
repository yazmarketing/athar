"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ImageUp,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AssetCategory = "character" | "location" | "prop";

export type LibraryAsset = {
  id: string;
  name: string;
  category?: AssetCategory | string | null;
  status: string;
  url: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  character: "Character",
  location: "Location",
  prop: "Prop",
};

const FILTERS: { id: "all" | AssetCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "character", label: "Characters" },
  { id: "location", label: "Locations" },
  { id: "prop", label: "Props" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: LibraryAsset[] | null;
  loading: boolean;
  onRefresh: () => void;
  /** Attach a verified asset to the video dock (closes the dialog). */
  onAttach: (id: string) => void;
  /** Ask the studio to confirm-delete (its ConfirmDialog stacks on top). */
  onDelete: (asset: { id: string; name: string }) => void;
  deletingAssetId: string | null;
  registering: boolean;
  /** Upload + register a new asset; throws to keep the form open. */
  onRegister: (
    file: File,
    name: string,
    category: AssetCategory | "auto"
  ) => Promise<void>;
};

/**
 * Higgsfield-style "Elements" picker for the BytePlus verified-asset
 * library: a card grid of registered faces/characters with a New-asset
 * card, and an inline register form (image + name — BytePlus assigns the
 * status, so there is nothing else to fill in).
 */
export function AssetLibraryDialog({
  open,
  onOpenChange,
  assets,
  loading,
  onRefresh,
  onAttach,
  onDelete,
  deletingAssetId,
  registering,
  onRegister,
}: Props) {
  const [view, setView] = useState<"grid" | "new">("grid");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | AssetCategory>("all");
  const [idDraft, setIdDraft] = useState("");
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState<AssetCategory | "auto">(
    "auto"
  );
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Objects URLs leak unless revoked — one per selected file.
  const previewUrl = useMemo(
    () => (draftFile ? URL.createObjectURL(draftFile) : null),
    [draftFile]
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // A fresh open always lands on the grid, not a half-filled form.
  useEffect(() => {
    if (open) {
      setView("grid");
      setQuery("");
      setFilter("all");
      setIdDraft("");
      setDraftFile(null);
      setDraftName("");
      setDraftCategory("auto");
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!assets) return null;
    const q = query.trim().toLowerCase();
    let list = assets;
    if (filter !== "all") {
      // Strict: a tab shows only assets saved with that category. Untagged
      // assets (registered before categories existed) appear under All.
      list = list.filter((a) => a.category === filter);
    }
    if (!q) return list;
    return list.filter(
      (a) =>
        (a.name || "").toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
    );
  }, [assets, query, filter]);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    const allowed = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ]);
    if (!allowed.has(file.type)) return;
    setDraftFile(file);
    if (!draftName.trim()) {
      setDraftName(file.name.replace(/\.[^.]+$/, "").slice(0, 60));
    }
  };

  const submitNew = async () => {
    if (!draftFile || registering) return;
    try {
      await onRegister(draftFile, draftName, draftCategory);
      setDraftFile(null);
      setDraftName("");
      setDraftCategory("auto");
      setView("grid");
    } catch {
      // studio already toasted — stay on the form so nothing typed is lost
    }
  };

  const attachById = () => {
    const id = idDraft.trim();
    if (!id) return;
    setIdDraft("");
    onAttach(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-white/8 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-gold" />
            {view === "grid" ? "Asset library" : "New asset"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {view === "grid"
              ? "Verified faces & characters — click one to attach it to the video"
              : "Upload a clear photo. BytePlus verifies it before it can be used (about a minute)."}
          </p>
        </DialogHeader>

        {view === "grid" ? (
          <>
            <div className="flex items-center gap-2 px-5 pt-4">
              <div className="flex h-8 flex-1 items-center gap-2 rounded-full bg-white/5 px-3 ring-1 ring-white/10">
                <Search className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search assets…"
                  className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
              <button
                type="button"
                onClick={onRefresh}
                className="shrink-0 text-[11px] text-muted-foreground transition hover:text-foreground"
              >
                Refresh
              </button>
            </div>

            <div className="flex items-center gap-1.5 px-5 pt-3">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "h-7 rounded-full px-3 text-xs transition",
                    filter === f.id
                      ? "bg-foreground text-background"
                      : "bg-white/5 text-muted-foreground ring-1 ring-white/10 hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-5">
              {loading && !assets ? (
                <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading assets…
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  <button
                    type="button"
                    onClick={() => setView("new")}
                    className="flex aspect-[4/5] flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-white/15 bg-white/[0.03] text-muted-foreground transition hover:border-gold/40 hover:text-foreground"
                  >
                    <span className="flex size-10 items-center justify-center rounded-full bg-white/8">
                      <Plus className="size-5" />
                    </span>
                    <span className="text-xs font-medium">New asset</span>
                  </button>

                  {(filtered ?? []).map((a) => {
                    const active = a.status === "Active";
                    const deleting = deletingAssetId === a.id;
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          "group relative overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-white/10 transition",
                          active && "hover:ring-gold/40",
                          !active && "opacity-60"
                        )}
                      >
                        <button
                          type="button"
                          disabled={!active || deleting}
                          onClick={() => onAttach(a.id)}
                          className={cn(
                            "flex w-full flex-col text-left",
                            active ? "cursor-pointer" : "cursor-not-allowed"
                          )}
                        >
                          {a.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={a.url}
                              alt={a.name || "Asset"}
                              className="aspect-square w-full object-cover"
                            />
                          ) : (
                            <span className="flex aspect-square w-full items-center justify-center bg-white/5">
                              <ShieldCheck className="size-7 text-gold/70" />
                            </span>
                          )}
                          <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
                            <span className="text-[10px] tracking-wide text-muted-foreground">
                              {CATEGORY_LABEL[a.category ?? ""] ?? "Asset"} ·{" "}
                              <span className={active ? "text-gold" : ""}>
                                {a.status}
                              </span>
                            </span>
                            <span className="truncate text-xs font-medium text-foreground">
                              {a.name || "Unnamed"}
                            </span>
                            <span className="truncate font-mono text-[10px] text-muted-foreground">
                              {a.id}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={deleting}
                          aria-label={`Delete ${a.name || a.id}`}
                          title="Delete from BytePlus library (frees quota)"
                          onClick={() =>
                            onDelete({ id: a.id, name: a.name })
                          }
                          className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md bg-black/60 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100 hover:bg-red-600 disabled:opacity-100"
                        >
                          {deleting ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {filtered && filtered.length === 0 && !loading && (
                <p className="pt-4 text-center text-xs text-muted-foreground">
                  {query
                    ? "No assets match the search."
                    : "No characters yet — create one, or open an image in the Library and use “Register as video character”."}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-white/8 px-5 py-3">
              <Input
                value={idDraft}
                onChange={(e) => setIdDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    attachById();
                  }
                }}
                placeholder="or paste an asset ID (asset-2026…)"
                className="h-8 flex-1 border-white/8 bg-transparent text-xs"
              />
              <Button
                size="sm"
                className="h-8 rounded-full bg-gold px-4 text-xs text-primary-foreground"
                onClick={attachById}
                disabled={!idDraft.trim()}
              >
                Add
              </Button>
            </div>
          </>
        ) : (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <div className="grid gap-4 p-5 sm:grid-cols-[1fr_240px]">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  pickFile(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "flex min-h-[260px] flex-col items-center justify-center gap-2.5 overflow-hidden rounded-xl border border-dashed border-white/15 bg-white/[0.03] text-muted-foreground transition hover:border-gold/40",
                  dragOver && "border-gold/60 bg-gold-soft/30"
                )}
              >
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Selected"
                    className="max-h-[320px] w-full object-contain"
                  />
                ) : (
                  <>
                    <span className="flex size-11 items-center justify-center rounded-full bg-white/8">
                      <ImageUp className="size-5" />
                    </span>
                    <span className="text-xs">
                      Drop an image here, or click to browse
                    </span>
                    <span className="text-[10px]">
                      JPEG, PNG, or WebP — one clear face
                    </span>
                  </>
                )}
              </button>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Category
                  </span>
                  <Select
                    value={draftCategory}
                    onValueChange={(v) =>
                      setDraftCategory(v as AssetCategory | "auto")
                    }
                  >
                    <SelectTrigger className="h-9 w-full border-white/8 bg-transparent text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="character">Character</SelectItem>
                      <SelectItem value="location">Location</SelectItem>
                      <SelectItem value="prop">Prop</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-[10px] text-muted-foreground">
                    How it's grouped in this library. Auto files it under
                    Characters.
                  </span>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Name
                  </span>
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value.slice(0, 60))}
                    placeholder="e.g. Fatima"
                    className="h-9 border-white/8 bg-transparent text-sm"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    The display name, shown in this library.
                  </span>
                </label>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Real-person photos are moderated by BytePlus. Once the
                  status turns Active, the asset can be attached to any
                  video.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-white/8 px-5 py-3">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full px-4 text-xs"
                onClick={() => {
                  setDraftFile(null);
                  setDraftName("");
                  setView("grid");
                }}
                disabled={registering}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 rounded-full bg-gold px-4 text-xs text-primary-foreground"
                onClick={() => void submitNew()}
                disabled={!draftFile || registering}
              >
                {registering ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Registering…
                  </>
                ) : (
                  "Create"
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
