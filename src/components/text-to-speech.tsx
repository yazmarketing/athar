"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Briefcase,
  Clapperboard,
  Clock,
  Download,
  Headphones,
  Loader2,
  Megaphone,
  MessageCircle,
  Mic,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VoiceLibraryDialog } from "@/components/voice-library-dialog";
import { Waveform } from "@/components/waveform";
import {
  DEFAULT_SAMPLE_RATE,
  DEFAULT_SPEED,
  DEFAULT_STABILITY,
  DIALECT_OPTIONS,
  MAX_SPEED,
  MIN_SPEED,
  TTS_PRESETS,
  type TtsDialect,
} from "@/config/tts";
import { MAX_TTS_CHARACTERS, totalCharCount } from "@/lib/tts-segments";
import { cn, readJson } from "@/lib/utils";
import type {
  ClientRecord,
  MunsitVoice,
  TtsGenerationRecord,
  TtsSegment,
} from "@/lib/types";

type Props = {
  clients: ClientRecord[];
  defaultClientId?: string | null;
  defaultProjectId?: string | null;
  isAdmin?: boolean;
};

/** Select can't hold an empty value, so "no client" needs a sentinel. */
const NO_CLIENT = "__none__";

type SpeakerBlock = {
  kind: "speaker";
  id: string;
  voiceId: string;
  voiceName: string;
  text: string;
};
type PauseBlock = { kind: "pause"; id: string; ms: number };
type Block = SpeakerBlock | PauseBlock;

const PAUSE_PRESETS = [250, 500, 1000, 2000, 3000];

const PRESET_ICONS: Record<string, typeof Clapperboard> = {
  clapperboard: Clapperboard,
  megaphone: Megaphone,
  "message-circle": MessageCircle,
  headphones: Headphones,
  briefcase: Briefcase,
  "book-open": BookOpen,
};

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

type EngineStatus = { configured?: boolean; ok?: boolean; error?: string };

export function TextToSpeech({ clients, defaultClientId, defaultProjectId, isAdmin }: Props) {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [voices, setVoices] = useState<MunsitVoice[] | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTarget, setLibraryTarget] = useState<string | null>(null);

  const [blocks, setBlocks] = useState<Block[]>([
    { kind: "speaker", id: newId(), voiceId: "", voiceName: "", text: "" },
  ]);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState<string | null>(defaultClientId ?? null);
  const [stability, setStability] = useState(DEFAULT_STABILITY);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [dialect, setDialect] = useState<TtsDialect>("auto");
  const [streaming, setStreaming] = useState(true);
  const [wordTimestamps, setWordTimestamps] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<TtsGenerationRecord | null>(null);
  const [resultAudioUrl, setResultAudioUrl] = useState<string | null>(null);

  const [rightTab, setRightTab] = useState<"settings" | "history">("settings");
  const [history, setHistory] = useState<TtsGenerationRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [diacritizing, setDiacritizing] = useState<string | null>(null);

  const loadVoices = useCallback(async () => {
    setVoicesLoading(true);
    try {
      const res = await fetch("/api/tts/voices");
      const json = await readJson<{ voices?: MunsitVoice[]; error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Could not load voices");
      setVoices(json.voices ?? []);
      setVoicesError(null);
    } catch (err) {
      setVoicesError(err instanceof Error ? err.message : "Could not load voices");
    } finally {
      setVoicesLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/tts");
      const json = await readJson<{ generations?: TtsGenerationRecord[] }>(res);
      setHistory(json.generations ?? []);
    } catch {
      toast.error("Could not load history");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/tts/status")
      .then((res) => res.json())
      .then(setEngine)
      .catch(() => setEngine({ configured: false, ok: false }));
    void loadVoices();
    void loadHistory();
  }, [loadVoices, loadHistory]);

  // Default every unset speaker to the first available voice once voices load.
  useEffect(() => {
    if (!voices?.length) return;
    setBlocks((prev) =>
      prev.map((b) =>
        b.kind === "speaker" && !b.voiceId
          ? { ...b, voiceId: voices[0].voice_id, voiceName: voices[0].name }
          : b
      )
    );
  }, [voices]);

  const speechBlocks = blocks.filter((b): b is SpeakerBlock => b.kind === "speaker");
  const segments: TtsSegment[] = useMemo(
    () =>
      blocks.map((b) =>
        b.kind === "speaker"
          ? { type: "speech", voiceId: b.voiceId, voiceName: b.voiceName, text: b.text }
          : { type: "pause", ms: b.ms }
      ),
    [blocks]
  );
  const charCount = totalCharCount(segments);
  const overLimit = charCount > MAX_TTS_CHARACTERS;
  const hasText = speechBlocks.some((b) => b.text.trim());
  const missingVoice = speechBlocks.some((b) => !b.voiceId);
  const canStream = streaming && speechBlocks.length === 1 && blocks.length === 1 && !wordTimestamps;

  const blockingReason = !engine?.ok
    ? "Text-to-speech isn't configured — ask an admin"
    : !hasText
      ? "Add some text first"
      : missingVoice
        ? "Pick a voice for every speaker"
        : overLimit
          ? `Over the ${MAX_TTS_CHARACTERS.toLocaleString()} character limit`
          : null;

  const updateBlock = (id: string, patch: Partial<SpeakerBlock>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id && b.kind === "speaker" ? { ...b, ...patch } : b))
    );
  };

  const addSpeaker = () => {
    const defaultVoice = voices?.[0];
    setBlocks((prev) => [
      ...prev,
      {
        kind: "speaker",
        id: newId(),
        voiceId: defaultVoice?.voice_id ?? "",
        voiceName: defaultVoice?.name ?? "",
        text: "",
      },
    ]);
  };

  const addPause = () => {
    setBlocks((prev) => [...prev, { kind: "pause", id: newId(), ms: 500 }]);
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => (prev.length > 1 ? prev.filter((b) => b.id !== id) : prev));
  };

  const applyPreset = (preset: (typeof TTS_PRESETS)[number]) => {
    setStability(preset.stability);
    setSpeed(preset.speed);
    setBlocks((prev) => {
      const first = prev.find((b): b is SpeakerBlock => b.kind === "speaker");
      if (!first) return prev;
      return prev.map((b) => (b.id === first.id ? { ...b, text: preset.text } : b));
    });
  };

  const runTashkil = async (block: SpeakerBlock) => {
    if (!block.text.trim()) return;
    setDiacritizing(block.id);
    try {
      const res = await fetch("/api/tts/tashkil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: block.text }),
      });
      const json = await readJson<{ text?: string; error?: string }>(res);
      if (!res.ok || !json.text) throw new Error(json.error ?? "Diacritization failed");
      updateBlock(block.id, { text: json.text });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add diacritics");
    } finally {
      setDiacritizing(null);
    }
  };

  const generate = async () => {
    if (blockingReason) {
      toast.error(blockingReason);
      return;
    }
    setGenerating(true);
    setResult(null);
    if (resultAudioUrl) URL.revokeObjectURL(resultAudioUrl);
    setResultAudioUrl(null);

    try {
      const body = {
        title: title.trim() || speechBlocks[0]?.text.slice(0, 60),
        clientId,
        projectId: defaultProjectId ?? null,
        stability,
        speed,
        sampleRate: DEFAULT_SAMPLE_RATE,
        dialect,
        streaming: canStream,
        wordTimestamps,
        segments,
      };
      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (canStream && res.ok && res.headers.get("Content-Type")?.includes("audio/raw")) {
        // Raw PCM16 pass-through — decode via Web Audio and hand the player a
        // WAV blob URL, same object either path ends up rendering.
        const pcm = await res.arrayBuffer();
        const wavBlob = pcmToWavBlob(pcm, DEFAULT_SAMPLE_RATE);
        const url = URL.createObjectURL(wavBlob);
        setResultAudioUrl(url);
        toast.success("Generated");
        void loadHistory();
        return;
      }

      const json = await readJson<{ generation?: TtsGenerationRecord; error?: string }>(res);
      if (!res.ok || !json.generation) throw new Error(json.error ?? "Generation failed");
      setResult(json.generation);
      toast.success("Generated");
      void loadHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const openLibraryFor = (blockId: string) => {
    setLibraryTarget(blockId);
    setLibraryOpen(true);
  };

  const targetBlock = libraryTarget ? blocks.find((b) => b.id === libraryTarget) : null;
  const currentTargetVoiceId = targetBlock?.kind === "speaker" ? targetBlock.voiceId : null;

  const runHistorySearch = async () => {
    const q = historyQuery.trim();
    if (!q) {
      void loadHistory();
      return;
    }
    const res = await fetch(`/api/tts/search?q=${encodeURIComponent(q)}`);
    const json = await readJson<{ hits?: { id: string }[] }>(res);
    const ids = new Set((json.hits ?? []).map((h) => h.id));
    setHistory((prev) => prev.filter((g) => ids.has(g.id)));
  };

  const removeGeneration = async (generation: TtsGenerationRecord) => {
    const res = await fetch(`/api/tts/${generation.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete that");
      return;
    }
    toast.success("Deleted");
    setHistory((prev) => prev.filter((g) => g.id !== generation.id));
  };

  const loadIntoEditor = (generation: TtsGenerationRecord) => {
    setBlocks(
      generation.segments.map((seg) =>
        seg.type === "speech"
          ? { kind: "speaker", id: newId(), voiceId: seg.voiceId, voiceName: seg.voiceName, text: seg.text }
          : { kind: "pause", id: newId(), ms: seg.ms }
      )
    );
    setStability(generation.stability);
    setSpeed(generation.speed);
    setDialect(generation.dialect as TtsDialect);
    setTitle(generation.title);
    setResult(generation);
    setRightTab("settings");
    toast.success("Loaded into editor");
  };

  const audioSrc = resultAudioUrl ?? result?.output_url ?? null;

  return (
    <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Canvas */}
      <div className="flex min-h-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
              engine?.ok
                ? "bg-emerald-400/10 text-emerald-300"
                : "bg-amber-400/10 text-amber-300"
            )}
          >
            <Mic className="size-3" />
            {engine?.ok
              ? "Voice ready"
              : engine?.configured === false
                ? "Text-to-speech not set up — ask an admin"
                : "Text-to-speech offline"}
          </span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-white/8 p-4">
          {blocks.map((block) =>
            block.kind === "pause" ? (
              <div key={block.id} className="flex items-center gap-2">
                <div className="h-px flex-1 bg-white/8" />
                <div className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-white/10">
                  <Clock className="size-3" />
                  <select
                    value={block.ms}
                    onChange={(e) =>
                      setBlocks((prev) =>
                        prev.map((b) =>
                          b.id === block.id && b.kind === "pause"
                            ? { ...b, ms: Number(e.target.value) }
                            : b
                        )
                      )
                    }
                    className="bg-transparent outline-none"
                  >
                    {PAUSE_PRESETS.map((ms) => (
                      <option key={ms} value={ms} className="bg-background text-foreground">
                        {ms < 1000 ? `${ms}ms` : `${ms / 1000}s`} pause
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeBlock(block.id)}>
                    <X className="size-3" />
                  </button>
                </div>
                <div className="h-px flex-1 bg-white/8" />
              </div>
            ) : (
              <div key={block.id} className="group space-y-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openLibraryFor(block.id)}
                    className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium ring-1 ring-white/10 transition hover:ring-gold/40"
                  >
                    <Mic className="size-3 text-gold" />
                    {block.voiceName || "Choose a voice"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runTashkil(block)}
                    disabled={!block.text.trim() || diacritizing === block.id}
                    title="Add Arabic diacritics (Tashkīl)"
                    className="flex items-center gap-1 text-[11px] text-muted-foreground opacity-0 transition hover:text-gold group-hover:opacity-100 disabled:opacity-30"
                  >
                    {diacritizing === block.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Sparkles className="size-3" />
                    )}
                    Tashkīl
                  </button>
                  {blocks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeBlock(block.id)}
                      className="ml-auto text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <Textarea
                  value={block.text}
                  onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                  dir="rtl"
                  rows={3}
                  placeholder="اكتب النص هنا…"
                  className="resize-none text-sm leading-relaxed"
                />
              </div>
            )
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full px-3 text-xs" onClick={addSpeaker}>
              <Plus className="size-3.5" /> Add Speaker
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full px-3 text-xs" onClick={addPause}>
              <Clock className="size-3.5" /> Add pause
            </Button>
          </div>

          {!hasText && (
            <div className="pt-2">
              <p className="mb-2 text-[11px] tracking-wide text-muted-foreground uppercase">
                Get started with — fills in sample text and matching pacing:
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {TTS_PRESETS.map((preset) => {
                  const Icon = PRESET_ICONS[preset.icon] ?? Sparkles;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="flex items-start gap-2.5 rounded-lg bg-white/5 px-3 py-2 text-left ring-1 ring-white/10 transition hover:bg-white/8 hover:ring-gold/30"
                    >
                      <Icon className="mt-0.5 size-3.5 shrink-0 text-gold" />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-foreground">
                          {preset.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {preset.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span
            className={cn(
              "text-xs tabular-nums",
              overLimit ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {charCount.toLocaleString()}/{MAX_TTS_CHARACTERS.toLocaleString()} characters
          </span>
          <Button
            size="lg"
            onClick={() => void generate()}
            disabled={generating}
            title={blockingReason ?? undefined}
            className={cn(
              "h-10 gap-2 rounded-full px-6 font-medium text-primary-foreground",
              blockingReason && "opacity-50"
            )}
          >
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Plus className="size-4" /> Generate
              </>
            )}
          </Button>
        </div>

        {audioSrc && (
          <div className="space-y-3 rounded-xl border border-white/8 bg-black/40 p-4">
            <Waveform src={audioSrc} />
            <audio src={audioSrc} controls className="w-full" />
            <div className="flex items-center gap-2">
              <a href={audioSrc} download={`${(title || "voice-over").replace(/\s+/g, "-")}.wav`}>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full px-3 text-xs">
                  <Download className="size-3.5" /> Download
                </Button>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="flex min-h-0 flex-col">
        <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as "settings" | "history")}>
          <TabsList className="w-full">
            <TabsTrigger value="settings" className="flex-1">
              Settings
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="mt-4 space-y-5">
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled voice-over"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">Client</label>
              <Select
                value={clientId ?? NO_CLIENT}
                onValueChange={(v) => setClientId(v === NO_CLIENT ? null : v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>No client</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-muted-foreground">Stability</label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {Math.round(stability * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={stability}
                onChange={(e) => setStability(Number(e.target.value))}
                className="w-full accent-gold"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Low (creative)</span>
                <span>High (recommended)</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-muted-foreground">Speed</label>
                <span className="text-[11px] tabular-nums text-muted-foreground">{speed.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={MIN_SPEED}
                max={MAX_SPEED}
                step={0.01}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-gold"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Slower</span>
                <span>Faster</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">Dialect</label>
              <Select value={dialect} onValueChange={(v) => setDialect(v as TtsDialect)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIALECT_OPTIONS.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center justify-between gap-3">
              <span className="text-sm">
                Enable Streaming
                {!canStream && streaming && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">
                    (off — multiple speakers or pauses)
                  </span>
                )}
              </span>
              <Switch checked={streaming} onCheckedChange={setStreaming} />
            </label>
            <p className="-mt-3 text-[11px] text-muted-foreground">
              When enabled, audio streams as it&apos;s generated — only for a
              single speaker with no pauses. When disabled, or when the
              request has more than one part, you get the complete file after
              generation.
            </p>

            <label className="flex items-center justify-between gap-3">
              <span className="text-sm">Enable word timestamps</span>
              <Switch checked={wordTimestamps} onCheckedChange={setWordTimestamps} />
            </label>
            <p className="-mt-3 text-[11px] text-muted-foreground">
              Get per-word timings alongside the audio — useful for captions.
              Disables streaming for this generation.
            </p>
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void runHistorySearch()}
                  placeholder="Search voice-overs…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Nothing generated yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {history.map((g) => (
                  <div
                    key={g.id}
                    className="group flex items-center gap-1 rounded-lg border border-white/8 p-2.5 transition hover:bg-white/[0.03]"
                  >
                    <button
                      type="button"
                      onClick={() => loadIntoEditor(g)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium">{g.title}</span>
                        {g.status === "failed" && (
                          <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
                            Failed
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {[
                          g.duration_s ? `${g.duration_s.toFixed(1)}s` : null,
                          g.cost > 0 ? `$${g.cost.toFixed(3)}` : null,
                          g.client_name,
                          new Date(g.created_at).toLocaleDateString(),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => void removeGeneration(g)}
                        className="shrink-0 rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-white/8 hover:text-foreground group-hover:opacity-100"
                        title="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <VoiceLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        voices={voices}
        loading={voicesLoading}
        error={voicesError}
        onRefresh={loadVoices}
        selectedVoiceId={currentTargetVoiceId}
        onSelect={(voice) => {
          if (libraryTarget) {
            updateBlock(libraryTarget, { voiceId: voice.voice_id, voiceName: voice.name });
          }
        }}
      />

    </div>
  );
}

/** Wrap raw PCM16 (from a streamed generation) in a WAV header for playback. */
function pcmToWavBlob(pcm: ArrayBuffer, sampleRate: number): Blob {
  const data = new Uint8Array(pcm);
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + data.length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, data.length, true);
  return new Blob([header, data], { type: "audio/wav" });
}
