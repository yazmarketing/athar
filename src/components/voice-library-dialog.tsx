"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Mic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ageMeta, dialectMeta, languageMeta, type LocaleMeta } from "@/config/tts";
import { cn, readJson } from "@/lib/utils";
import type { MunsitVoice } from "@/lib/types";

type Tab = "all" | "collections" | "mine";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voices: MunsitVoice[] | null;
  loading: boolean;
  /** Set when the voices fetch failed — shown instead of an empty-filters message. */
  error?: string | null;
  onRefresh: () => void;
  selectedVoiceId?: string | null;
  onSelect: (voice: MunsitVoice) => void;
  /** voice_ids favorited for the active client (plus every global one). */
  favoriteVoiceIds: Set<string>;
  onToggleFavorite: (voice: MunsitVoice) => void;
};

/** Deterministic gradient + initial, for voices Munsit doesn't give an avatar for. */
const AVATAR_GRADIENTS = [
  "from-amber-400 to-rose-500",
  "from-sky-400 to-indigo-500",
  "from-emerald-400 to-teal-600",
  "from-fuchsia-400 to-purple-600",
  "from-orange-400 to-amber-600",
];
function avatarGradient(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function VoiceAvatar({ voice }: { voice: MunsitVoice }) {
  if (voice.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={voice.avatar_url}
        alt=""
        className="size-10 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white",
        avatarGradient(voice.voice_id)
      )}
    >
      {voice.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

const DEFAULT_CLONE_TEXT = "مرحبا، هذا صوتي الجديد في أثر.";

export function VoiceLibraryDialog({
  open,
  onOpenChange,
  voices,
  loading,
  error,
  onRefresh,
  selectedVoiceId,
  onSelect,
  favoriteVoiceIds,
  onToggleFavorite,
}: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<string>("all");
  const [dialect, setDialect] = useState<string>("all");
  const [age, setAge] = useState<string>("all");
  const [gender, setGender] = useState<string>("all");
  const [openFilter, setOpenFilter] = useState<"language" | "dialect" | "age" | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [cloning, setCloning] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteVoice = async (voice: MunsitVoice) => {
    if (!voice.id) return;
    setDeletingId(voice.id);
    try {
      const res = await fetch(`/api/tts/voices/${voice.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete that voice");
      toast.success(`Removed "${voice.name}"`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that voice");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (open) {
      setTab("all");
      setQuery("");
      setLanguage("all");
      setDialect("all");
      setAge("all");
      setGender("all");
      setCloning(false);
    } else {
      audioRef.current?.pause();
      setPlayingId(null);
    }
  }, [open]);

  const library = useMemo(() => voices?.filter((v) => v.source !== "cloned") ?? [], [voices]);
  const mine = useMemo(() => voices?.filter((v) => v.source === "cloned") ?? [], [voices]);
  const base = tab === "mine" ? mine : library;

  const languageOptions = useMemo(
    () => Array.from(new Set(base.flatMap((v) => v.languages))).sort(),
    [base]
  );
  const dialectOptions = useMemo(
    () => Array.from(new Set(base.flatMap((v) => v.dialect))).sort(),
    [base]
  );
  const ageOptions = useMemo(
    () => Array.from(new Set(base.map((v) => v.age).filter((a): a is string => Boolean(a)))).sort(),
    [base]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = base.filter((v) => {
      if (language !== "all" && !v.languages.includes(language)) return false;
      if (dialect !== "all" && !v.dialect.includes(dialect)) return false;
      if (age !== "all" && v.age !== age) return false;
      if (gender !== "all" && v.gender !== gender) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        (v.description ?? "").toLowerCase().includes(q) ||
        v.dialect.some((d) => d.toLowerCase().includes(q))
      );
    });
    // Favorited voices first, for reuse across the team on this client —
    // otherwise a stable sort so nothing else jumps around.
    if (tab !== "all") return matches;
    return [...matches].sort((a, b) => {
      const fa = favoriteVoiceIds.has(a.voice_id) ? 1 : 0;
      const fb = favoriteVoiceIds.has(b.voice_id) ? 1 : 0;
      return fb - fa;
    });
  }, [base, query, language, dialect, age, gender, tab, favoriteVoiceIds]);

  /** "Collections" — Munsit doesn't expose real collections via the API, so
      this groups the library by dialect, which is what a team actually
      browses by ("give me an Emirati voice"). */
  const collections = useMemo(() => {
    const groups = new Map<string, MunsitVoice[]>();
    for (const v of library) {
      const keys = v.dialect.length ? v.dialect : ["Other"];
      for (const key of keys) {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(v);
      }
    }
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [library]);

  const togglePreview = (voice: MunsitVoice) => {
    if (!voice.sample_url) return;
    if (playingId === voice.voice_id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = voice.sample_url;
    audioRef.current.onended = () => setPlayingId(null);
    void audioRef.current.play();
    setPlayingId(voice.voice_id);
  };

  const row = (voice: MunsitVoice) => {
    const selected = voice.voice_id === selectedVoiceId;
    return (
      <div
        key={voice.voice_id}
        className={cn(
          "flex items-center gap-3 rounded-xl p-3 ring-1 ring-white/8 transition",
          selected ? "bg-gold-soft/20 ring-gold/40" : "hover:bg-white/[0.03]"
        )}
      >
        <VoiceAvatar voice={voice} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{voice.name}</span>
            {voice.gender && (
              <Badge variant="outline" className="normal-case">
                {voice.gender}
              </Badge>
            )}
            {voice.dialect[0] && (
              <Badge variant="outline" className="normal-case">
                {voice.dialect[0]}
              </Badge>
            )}
          </div>
          {voice.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {voice.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onToggleFavorite(voice)}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full transition",
            favoriteVoiceIds.has(voice.voice_id)
              ? "text-gold"
              : "text-muted-foreground hover:bg-white/8 hover:text-foreground"
          )}
          title={
            favoriteVoiceIds.has(voice.voice_id)
              ? "Remove from favorites for this client"
              : "Favorite for this client — reusable by the whole team"
          }
        >
          <Star
            className="size-3.5"
            fill={favoriteVoiceIds.has(voice.voice_id) ? "currentColor" : "none"}
          />
        </button>
        {voice.sample_url && (
          <button
            type="button"
            onClick={() => togglePreview(voice)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
            title="Preview"
          >
            {playingId === voice.voice_id ? (
              <Pause className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
          </button>
        )}
        <Button
          size="sm"
          variant={selected ? "default" : "outline"}
          className={cn(
            "h-8 shrink-0 rounded-full px-4 text-xs",
            selected && "bg-gold text-primary-foreground"
          )}
          onClick={() => {
            onSelect(voice);
            onOpenChange(false);
          }}
        >
          {selected ? "Selected" : "Select"}
        </Button>
        {voice.source === "cloned" && voice.id && (
          <button
            type="button"
            onClick={() => void deleteVoice(voice)}
            disabled={deletingId === voice.id}
            title="Remove from My Voices"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-white/8 hover:text-destructive disabled:opacity-50"
          >
            {deletingId === voice.id ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-white/8 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-gold" />
            Voice Library
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {cloning ? "Clone a voice from a sample recording" : "Pick a voice to use for generation"}
          </p>
        </DialogHeader>

        {cloning ? (
          <ClonePanel
            onCancel={() => setCloning(false)}
            onCloned={(voice) => {
              setCloning(false);
              onRefresh();
              onSelect(voice);
              onOpenChange(false);
            }}
          />
        ) : (
          <>
            <div className="flex items-center gap-1.5 px-5 pt-4">
              {(
                [
                  ["all", "All Voices"],
                  ["collections", "Collections"],
                  ["mine", "My Voices"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "h-8 rounded-full px-3 text-xs transition",
                    tab === id
                      ? "bg-foreground text-background"
                      : "bg-white/5 text-muted-foreground ring-1 ring-white/10 hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab !== "collections" && (
              <>
                <div className="flex items-center gap-2 px-5 pt-3">
                  <div className="flex h-8 flex-1 items-center gap-2 rounded-full bg-white/5 px-3 ring-1 ring-white/10">
                    <Search className="size-3.5 shrink-0 text-muted-foreground" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search voice by name, dialect, or language"
                      className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={onRefresh}
                    className="shrink-0 text-muted-foreground transition hover:text-foreground"
                    title="Refresh"
                  >
                    <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 px-5 pt-3">
                  <LocaleDropdown
                    label="Language"
                    value={language}
                    onChange={setLanguage}
                    options={languageOptions}
                    meta={languageMeta}
                    open={openFilter === "language"}
                    onOpenChange={(o) => setOpenFilter(o ? "language" : null)}
                  />
                  <LocaleDropdown
                    label="Dialect"
                    value={dialect}
                    onChange={setDialect}
                    options={dialectOptions}
                    meta={dialectMeta}
                    open={openFilter === "dialect"}
                    onOpenChange={(o) => setOpenFilter(o ? "dialect" : null)}
                  />
                  <LocaleDropdown
                    label="Age"
                    value={age}
                    onChange={setAge}
                    options={ageOptions}
                    meta={ageMeta}
                    showFlag={false}
                    open={openFilter === "age"}
                    onOpenChange={(o) => setOpenFilter(o ? "age" : null)}
                  />
                  {(["male", "female"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender((v) => (v === g ? "all" : g))}
                      className={cn(
                        "h-7 rounded-full px-3 text-xs capitalize transition",
                        gender === g
                          ? "bg-foreground text-background"
                          : "bg-white/5 text-muted-foreground ring-1 ring-white/10 hover:text-foreground"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="max-h-[50vh] overflow-y-auto p-5">
              {error && !voices?.length ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 rounded-full px-4 text-xs"
                    onClick={onRefresh}
                  >
                    <RefreshCw className="size-3.5" /> Retry
                  </Button>
                </div>
              ) : loading && !voices ? (
                <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading voices…
                </div>
              ) : tab === "collections" ? (
                <div className="space-y-5">
                  {collections.map(([name, group]) => (
                    <div key={name}>
                      <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        {name} · {group.length}
                      </p>
                      <div className="space-y-1.5">{group.map(row)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {tab === "mine" && (
                    <button
                      type="button"
                      onClick={() => setCloning(true)}
                      className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/15 p-3 text-muted-foreground transition hover:border-gold/40 hover:text-foreground"
                    >
                      <span className="flex size-10 items-center justify-center rounded-full bg-white/8">
                        <Plus className="size-4" />
                      </span>
                      <span className="text-sm font-medium">Clone your voice</span>
                    </button>
                  )}
                  {filtered.map(row)}
                  {filtered.length === 0 && (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      {tab === "mine"
                        ? "No cloned voices yet — clone one above."
                        : "No voices match those filters."}
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A filter dropdown showing a flag (or other icon) per option, matching
 * Munsit's own picker — much easier to scan than plain code strings like
 * "najdi" or "en" in a bare `<select>`.
 */
function LocaleDropdown({
  label,
  value,
  onChange,
  options,
  meta,
  showFlag = true,
  open,
  onOpenChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  meta: (code: string) => LocaleMeta;
  showFlag?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open, onOpenChange]);

  if (options.length === 0) return null;
  const active = value !== "all" ? meta(value) : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-full px-3 text-xs transition",
          active
            ? "bg-white text-black"
            : "bg-white/5 text-muted-foreground ring-1 ring-white/10 hover:text-foreground"
        )}
      >
        {active && showFlag && <span className="text-sm leading-none">{active.flag}</span>}
        <span>{active ? active.label : label}</span>
        <ChevronDown className="size-3.5 opacity-60" />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-20 mt-1.5 max-h-64 w-56 overflow-y-auto rounded-xl bg-popover p-1.5 shadow-lg ring-1 ring-foreground/10">
          <button
            type="button"
            onClick={() => {
              onChange("all");
              onOpenChange(false);
            }}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-white/8"
          >
            <span className="text-muted-foreground">Any {label.toLowerCase()}</span>
            {value === "all" && <Check className="size-3.5 text-gold" />}
          </button>
          {options.map((code) => {
            const m = meta(code);
            const selected = value === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  onChange(code);
                  onOpenChange(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-white/8",
                  selected && "bg-gold-soft/20"
                )}
              >
                {showFlag && <span className="text-base leading-none">{m.flag}</span>}
                <span className="min-w-0 flex-1 truncate">{m.label}</span>
                {selected && <Check className="size-3.5 shrink-0 text-gold" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Upload a sample → preview → save. Munsit needs both the preview clip and
    the original sample, and the exact text the preview was generated from. */
function ClonePanel({
  onCancel,
  onCloned,
}: {
  onCancel: () => void;
  onCloned: (voice: MunsitVoice) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState(DEFAULT_CLONE_TEXT);
  const [previewing, setPreviewing] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setPreviewBlob(null);
    setPreviewUrl(null);
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, "").slice(0, 60));
  };

  const runPreview = async () => {
    if (!file || text.trim().length < 10) return;
    setPreviewing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("text", text.trim());
      form.append("similarity", "0.8");
      const res = await fetch("/api/tts/voices/preview", { method: "POST", body: form });
      if (!res.ok) {
        const json = await readJson<{ error?: string }>(res);
        throw new Error(json.error ?? "Preview failed");
      }
      const blob = await res.blob();
      setPreviewBlob(blob);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      const audio = new Audio(url);
      void audio.play();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not preview that voice");
    } finally {
      setPreviewing(false);
    }
  };

  const save = async () => {
    if (!file || !previewBlob || !name.trim()) return;
    setSaving(true);
    try {
      const form = new FormData();
      form.append("voice_file", previewBlob, "preview.wav");
      form.append("reference_audio_file", file);
      form.append("text", text.trim());
      form.append("stability", "0.5");
      form.append("name", name.trim());
      const res = await fetch("/api/tts/voices/clone", { method: "POST", body: form });
      const json = await readJson<{ voice?: MunsitVoice; error?: string }>(res);
      if (!res.ok || !json.voice) throw new Error(json.error ?? "Clone failed");
      toast.success(`Voice "${name.trim()}" saved`);
      onCloned(json.voice);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that voice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-5">
      <input
        ref={fileInput}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-muted-foreground transition hover:border-gold/40"
      >
        {file ? (
          <>
            <Mic className="size-6 text-gold" />
            <span className="text-sm text-foreground">{file.name}</span>
            <span className="text-[11px]">Click to choose a different sample</span>
          </>
        ) : (
          <>
            <UploadCloud className="size-6" />
            <span className="text-sm">Upload a clear sample — at least 1 minute</span>
            <span className="text-[11px]">Quiet room, natural speech, no background noise</span>
          </>
        )}
      </button>

      <div className="space-y-1.5">
        <label className="text-[11px] text-muted-foreground">
          Preview text (Arabic, spoken in this voice)
        </label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          dir="rtl"
          rows={2}
          className="text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 rounded-full px-4 text-xs"
          onClick={() => void runPreview()}
          disabled={!file || text.trim().length < 10 || previewing}
        >
          {previewing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          Preview
        </Button>
        {previewUrl && (
          <span className="text-[11px] text-muted-foreground">
            Sounds right? Give it a name and save it below.
          </span>
        )}
      </div>

      {previewBlob && (
        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground">Voice name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 60))}
            placeholder="e.g. Yazan"
            className="h-9 text-sm"
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-white/8 pt-4">
        <Button variant="outline" size="sm" className="h-8 rounded-full px-4 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8 gap-1.5 rounded-full bg-gold px-4 text-xs text-primary-foreground"
          onClick={() => void save()}
          disabled={!previewBlob || !name.trim() || saving}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
          Save voice
        </Button>
      </div>
    </div>
  );
}
