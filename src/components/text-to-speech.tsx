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
  Link2,
  Loader2,
  Megaphone,
  MessageCircle,
  Mic,
  Plus,
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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { VoiceLibraryDialog } from "@/components/voice-library-dialog";
import { Waveform } from "@/components/waveform";
import { ProgressBar } from "@/components/generation-progress";
import { ModeToggle, VoDirectorBar, type VoDirectorMode } from "@/components/vo-director/vo-director-bar";
import { DirectorSegmentList } from "@/components/vo-director/director-segments";
import { TtsScriptDiffDialog, type DiffRow } from "@/components/vo-director/tts-script-diff-dialog";
import {
  DEFAULT_SAMPLE_RATE,
  DEFAULT_SPEED,
  DEFAULT_STABILITY,
  MAX_SPEED,
  MIN_SPEED,
  TTS_PRESETS,
} from "@/config/tts";
import { DELIVERY_TAGS, DEFAULT_REGISTER_STRENGTH } from "@/config/tts-director";
import { MAX_TTS_CHARACTERS, totalCharCount } from "@/lib/tts-segments";
import { cn, postJson, readJson } from "@/lib/utils";
import type {
  ClientRecord,
  MunsitVoice,
  TtsDirectorAnalysis,
  TtsDirectorSegment,
  TtsFavoriteVoice,
  TtsGenerationRecord,
  TtsSegment,
} from "@/lib/types";

type Props = {
  clients: ClientRecord[];
  defaultClientId?: string | null;
  defaultProjectId?: string | null;
  isAdmin?: boolean;
  /** Loaded once on mount/change — e.g. "Continue editing" from Library. */
  initialGeneration?: TtsGenerationRecord | null;
  /** Surfaces a generation's outcome in the app-wide notifications bell. */
  onNotify?: (n: { status: "success" | "error"; title: string; body?: string; id?: string | null }) => void;
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

export function TextToSpeech({
  clients,
  defaultClientId,
  defaultProjectId,
  isAdmin,
  initialGeneration,
  onNotify,
}: Props) {
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
  const [streaming, setStreaming] = useState(true);
  const [wordTimestamps, setWordTimestamps] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<TtsGenerationRecord | null>(null);
  const [resultAudioUrl, setResultAudioUrl] = useState<string | null>(null);

  // Every regenerate of the same script (without starting fresh) shares this
  // — Versions lists exactly the generations in this group, oldest to
  // newest. Browsing everything else the team has made lives in Library now,
  // not here — that's what stopped this tab from being usable at any scale.
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"settings" | "history">("settings");
  const [versions, setVersions] = useState<TtsGenerationRecord[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [diacritizing, setDiacritizing] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<TtsFavoriteVoice[]>([]);

  // --- VO Director ---------------------------------------------------
  const [mode, setMode] = useState<VoDirectorMode>("plain");
  const [delivery, setDelivery] = useState<string[]>([]);
  const [dialect, setDialect] = useState<"emirati" | "fusha">("emirati");
  const [registerStrength, setRegisterStrength] = useState(DEFAULT_REGISTER_STRENGTH);
  const [optimizing, setOptimizing] = useState(false);
  const [directorAnalysisId, setDirectorAnalysisId] = useState<string | null>(null);
  const [quickSegments, setQuickSegments] = useState<TtsDirectorSegment[]>([]);
  const [directorSegments, setDirectorSegments] = useState<TtsDirectorSegment[]>([]);
  const [generatingMaster, setGeneratingMaster] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);

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

  const loadVersions = useCallback(async (groupId: string | null) => {
    if (!groupId) {
      setVersions([]);
      return;
    }
    setVersionsLoading(true);
    try {
      const res = await fetch(`/api/tts?groupId=${groupId}`);
      const json = await readJson<{ generations?: TtsGenerationRecord[] }>(res);
      setVersions(json.generations ?? []);
    } catch {
      toast.error("Could not load versions");
    } finally {
      setVersionsLoading(false);
    }
  }, []);

  const loadFavorites = useCallback(async (forClientId: string | null) => {
    try {
      const url = forClientId
        ? `/api/tts/favorites?clientId=${forClientId}`
        : "/api/tts/favorites";
      const res = await fetch(url);
      const json = await readJson<{ favorites?: TtsFavoriteVoice[] }>(res);
      setFavorites(json.favorites ?? []);
    } catch {
      // Favorites are a convenience — a failed load just leaves the list plain.
    }
  }, []);

  useEffect(() => {
    fetch("/api/tts/status")
      .then((res) => res.json())
      .then(setEngine)
      .catch(() => setEngine({ configured: false, ok: false }));
    void loadVoices();
  }, [loadVoices]);

  // Versions always tracks whatever work is currently loaded.
  useEffect(() => {
    void loadVersions(currentGroupId);
  }, [currentGroupId, loadVersions]);

  // Favorites are scoped per client — reload whenever the active one changes.
  useEffect(() => {
    void loadFavorites(clientId);
  }, [clientId, loadFavorites]);

  const toggleFavorite = async (voice: MunsitVoice) => {
    const already = favorites.some((f) => f.voice_id === voice.voice_id);
    try {
      if (already) {
        const url = clientId
          ? `/api/tts/favorites?voiceId=${encodeURIComponent(voice.voice_id)}&clientId=${clientId}`
          : `/api/tts/favorites?voiceId=${encodeURIComponent(voice.voice_id)}`;
        const res = await fetch(url, { method: "DELETE" });
        if (!res.ok) throw new Error();
        setFavorites((prev) => prev.filter((f) => f.voice_id !== voice.voice_id));
      } else {
        const res = await fetch("/api/tts/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId: voice.voice_id, voiceName: voice.name, clientId }),
        });
        const json = await readJson<{ favorite?: TtsFavoriteVoice }>(res);
        if (!res.ok || !json.favorite) throw new Error();
        setFavorites((prev) => [...prev, json.favorite as TtsFavoriteVoice]);
      }
    } catch {
      toast.error("Could not update favorites");
    }
  };

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
  const favoriteVoiceIds = useMemo(
    () => new Set(favorites.map((f) => f.voice_id)),
    [favorites]
  );
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

  const generate = async (overrides?: { segments?: TtsSegment[]; directorAnalysisId?: string | null }) => {
    if (blockingReason) {
      toast.error(blockingReason);
      return;
    }
    setGenerating(true);
    setResult(null);
    if (resultAudioUrl) URL.revokeObjectURL(resultAudioUrl);
    setResultAudioUrl(null);

    // Decided up front (not read back from the response) so both the
    // streamed and buffered paths — and a fresh group's very first
    // version — all agree on the same id to reload Versions with.
    const groupId = currentGroupId ?? crypto.randomUUID();
    if (!currentGroupId) setCurrentGroupId(groupId);

    const effectiveSegments = overrides?.segments ?? segments;
    const effectiveStreaming =
      canStream && !overrides?.segments && effectiveSegments.length === segments.length;

    try {
      const body = {
        title: title.trim() || speechBlocks[0]?.text.slice(0, 60),
        clientId,
        projectId: defaultProjectId ?? null,
        groupId,
        stability,
        speed,
        sampleRate: DEFAULT_SAMPLE_RATE,
        streaming: effectiveStreaming,
        wordTimestamps,
        segments: effectiveSegments,
        directorAnalysisId: overrides?.directorAnalysisId ?? null,
      };
      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (effectiveStreaming && res.ok && res.headers.get("Content-Type")?.includes("audio/raw")) {
        // Raw PCM16 pass-through — decode via Web Audio and hand the player a
        // WAV blob URL, same object either path ends up rendering.
        const pcm = await res.arrayBuffer();
        const wavBlob = pcmToWavBlob(pcm, DEFAULT_SAMPLE_RATE);
        const url = URL.createObjectURL(wavBlob);
        setResultAudioUrl(url);
        toast.success("Generated");
        onNotify?.({ status: "success", title: "Voice-over ready", body: title || undefined });
        void loadVersions(groupId);
        return;
      }

      const json = await readJson<{ generation?: TtsGenerationRecord; error?: string }>(res);
      if (!res.ok || !json.generation) throw new Error(json.error ?? "Generation failed");
      setResult(json.generation);
      toast.success("Generated");
      onNotify?.({
        status: "success",
        title: "Voice-over ready",
        body: json.generation.title,
        id: json.generation.id,
      });
      void loadVersions(groupId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      toast.error(message);
      onNotify?.({ status: "error", title: "Voice-over failed", body: message });
    } finally {
      setGenerating(false);
    }
  };

  /** Delivery tags fold into the campaign context as a plain-English note. */
  const campaignContext = useMemo(() => {
    const labels = delivery
      .map((id) => DELIVERY_TAGS.find((t) => t.id === id)?.label)
      .filter(Boolean);
    return labels.length ? { notes: `Desired delivery: ${labels.join(", ")}` } : {};
  }, [delivery]);

  const scriptText = () => speechBlocks.map((b) => b.text.trim()).filter(Boolean).join("\n");

  /** Quick Optimize — one merged LLM pass, then straight into generation. */
  const generateWithQuickOptimize = async () => {
    if (blockingReason) {
      toast.error(blockingReason);
      return;
    }
    setOptimizing(true);
    try {
      const res = await fetch("/api/tts/director/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: scriptText(),
          campaignContext,
          mode: "quick",
          registerStrength,
          dialect,
          clientId,
        }),
      });
      const json = await readJson<{
        analysis?: TtsDirectorAnalysis;
        segments?: TtsDirectorSegment[];
        error?: string;
      }>(res);
      if (!res.ok || !json.analysis || !json.segments) {
        throw new Error(json.error ?? "Optimization failed");
      }
      setDirectorAnalysisId(json.analysis.id);
      setQuickSegments(json.segments);

      // v1 simplification: every optimized segment plays in the first
      // speaker's voice — true per-segment voice assignment for a
      // multi-speaker Quick Optimize script is a Director Mode capability.
      const primary = speechBlocks[0];
      const optimizedSegments: TtsSegment[] = json.segments.map((s) => ({
        type: "speech",
        voiceId: primary.voiceId,
        voiceName: primary.voiceName,
        text: s.tts || s.spoken || s.original,
      }));
      await generate({ segments: optimizedSegments, directorAnalysisId: json.analysis.id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setOptimizing(false);
    }
  };

  /** Director Mode — direction, dialect adaptation, and phonetics, in sequence. */
  const runDirectorPipeline = async () => {
    if (blockingReason) {
      toast.error(blockingReason);
      return;
    }
    setOptimizing(true);
    setDirectorSegments([]);
    try {
      const analyzeRes = await fetch("/api/tts/director/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: scriptText(),
          campaignContext,
          mode: "director",
          registerStrength,
          dialect,
          clientId,
        }),
      });
      const analyzeJson = await readJson<{ analysis?: TtsDirectorAnalysis; error?: string }>(
        analyzeRes
      );
      if (!analyzeRes.ok || !analyzeJson.analysis) {
        throw new Error(analyzeJson.error ?? "Direction pass failed");
      }
      const analysisId = analyzeJson.analysis.id;
      setDirectorAnalysisId(analysisId);

      const adaptRes = await fetch("/api/tts/director/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, registerStrength }),
      });
      const adaptJson = await readJson<{ error?: string }>(adaptRes);
      if (!adaptRes.ok) throw new Error(adaptJson.error ?? "Dialect adaptation failed");

      const phoneticsRes = await fetch("/api/tts/director/phonetics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId }),
      });
      const phoneticsJson = await readJson<{ segments?: TtsDirectorSegment[]; error?: string }>(
        phoneticsRes
      );
      if (!phoneticsRes.ok || !phoneticsJson.segments) {
        throw new Error(phoneticsJson.error ?? "Phonetic adaptation failed");
      }
      setDirectorSegments(phoneticsJson.segments.map((s) => ({ ...s, takes: [] })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Direction failed");
    } finally {
      setOptimizing(false);
    }
  };

  /** Stitch every segment's picked take into a final master — no re-synthesis. */
  const generateMaster = async () => {
    if (!directorAnalysisId) return;
    setGeneratingMaster(true);
    try {
      const res = await fetch("/api/tts/director/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: directorAnalysisId,
          title: title.trim() || undefined,
          clientId,
          projectId: defaultProjectId ?? null,
        }),
      });
      const json = await readJson<{ generation?: TtsGenerationRecord; error?: string }>(res);
      if (!res.ok || !json.generation) throw new Error(json.error ?? "Master generation failed");
      setResult(json.generation);
      setCurrentGroupId(json.generation.group_id);
      toast.success("Master generated");
      onNotify?.({
        status: "success",
        title: "Voice-over ready",
        body: json.generation.title,
        id: json.generation.id,
      });
      void loadVersions(json.generation.group_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Master generation failed";
      toast.error(message);
      onNotify?.({ status: "error", title: "Voice-over failed", body: message });
    } finally {
      setGeneratingMaster(false);
    }
  };

  const diffRows: DiffRow[] = (mode === "director" ? directorSegments : quickSegments).map(
    (s, i) => ({ id: s.id, label: `Segment ${i + 1}`, original: s.original, tts: s.tts || s.spoken })
  );

  const applyDiffEdit = async (segmentId: string, newText: string) => {
    const apply = (list: TtsDirectorSegment[]) =>
      list.map((s) => (s.id === segmentId ? { ...s, tts: newText } : s));
    if (mode === "director") setDirectorSegments(apply);
    else setQuickSegments(apply);
    await fetch(`/api/tts/director/segments/${segmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tts: newText }),
    }).catch(() => {});
  };

  const allTakesPicked =
    directorSegments.length > 0 && directorSegments.every((s) => s.selected_take_id);

  /** Clears the canvas and starts a brand-new work — a fresh Versions group. */
  const startFresh = () => {
    setBlocks([{ kind: "speaker", id: newId(), voiceId: voices?.[0]?.voice_id ?? "", voiceName: voices?.[0]?.name ?? "", text: "" }]);
    setTitle("");
    setCurrentGroupId(null);
    setResult(null);
    if (resultAudioUrl) URL.revokeObjectURL(resultAudioUrl);
    setResultAudioUrl(null);
    setDirectorAnalysisId(null);
    setQuickSegments([]);
    setDirectorSegments([]);
  };

  const openLibraryFor = (blockId: string) => {
    setLibraryTarget(blockId);
    setLibraryOpen(true);
  };

  const targetBlock = libraryTarget ? blocks.find((b) => b.id === libraryTarget) : null;
  const currentTargetVoiceId = targetBlock?.kind === "speaker" ? targetBlock.voiceId : null;

  const removeGeneration = async (generation: TtsGenerationRecord) => {
    const res = await fetch(`/api/tts/${generation.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete that");
      return;
    }
    toast.success("Deleted");
    setVersions((prev) => prev.filter((g) => g.id !== generation.id));
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
    setTitle(generation.title);
    setResult(generation);
    setCurrentGroupId(generation.group_id);
    setRightTab("history");
    toast.success("Loaded into editor");
  };

  // Arriving here from Library's "Continue editing" — load it once.
  useEffect(() => {
    if (initialGeneration) loadIntoEditor(initialGeneration);
  }, [initialGeneration]);

  const audioSrc = resultAudioUrl ?? result?.output_url ?? null;

  /**
   * A plain `<a download>` only downloads for a same-origin URL — the
   * generated file lives on Spaces, a different origin, so the browser was
   * navigating to it instead. Blob URLs (the streamed case) are already
   * same-origin; everything else goes through the same /api/download proxy
   * the image/video downloads use.
   */
  const downloadAudio = async () => {
    if (!audioSrc) return;
    const filename = `${(title || "voice-over").replace(/\s+/g, "-")}.wav`;
    try {
      const res = audioSrc.startsWith("blob:")
        ? await fetch(audioSrc)
        : await fetch(`/api/download?url=${encodeURIComponent(audioSrc)}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download that file");
    }
  };

  const shareGeneration = async (generation: TtsGenerationRecord) => {
    const { res, json } = await postJson<{ path?: string; error?: string }>(
      `/api/tts/${generation.id}/share`,
      {}
    );
    if (!res.ok || !json.path) {
      toast.error(json.error ?? "Could not create a link");
      return;
    }
    const url = `${window.location.origin}${json.path}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.success("Read-only link copied");
  };

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
          {currentGroupId && (
            <button
              type="button"
              onClick={startFresh}
              className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              New script
            </button>
          )}
          <div className="ml-auto">
            <ModeToggle value={mode} onChange={setMode} />
          </div>
        </div>

        {mode !== "plain" && (
          <VoDirectorBar
            delivery={delivery}
            onDeliveryChange={setDelivery}
            dialect={dialect}
            onDialectChange={setDialect}
            registerStrength={registerStrength}
            onRegisterStrengthChange={setRegisterStrength}
            onOpenPronunciationEditor={() => setDiffOpen(true)}
            pronunciationEditorDisabled={diffRows.length === 0}
            onSkipToPlain={() => setMode("plain")}
          />
        )}

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

        {mode === "director" && directorSegments.length > 0 ? (
          <div className="space-y-3">
            {speechBlocks.length > 1 && (
              <p className="text-[11px] text-muted-foreground">
                Delivery/dialect apply once across the whole script — pick each segment&apos;s
                voice below.
              </p>
            )}
            <DirectorSegmentList
              segments={directorSegments}
              onSegmentsChange={setDirectorSegments}
              voices={voices}
              defaultVoiceId={speechBlocks[0]?.voiceId ?? ""}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {directorSegments.filter((s) => s.selected_take_id).length}/
                {directorSegments.length} segments picked
              </span>
              <Button
                size="lg"
                onClick={() => void generateMaster()}
                disabled={generatingMaster || !allTakesPicked}
                className={cn(
                  "h-10 gap-2 rounded-full px-6 font-medium text-primary-foreground",
                  !allTakesPicked && "opacity-50"
                )}
              >
                {generatingMaster ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Plus className="size-4" /> Generate Master
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
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
              onClick={() =>
                void (mode === "plain"
                  ? generate()
                  : mode === "quick"
                    ? generateWithQuickOptimize()
                    : runDirectorPipeline())
              }
              disabled={generating || optimizing}
              title={blockingReason ?? undefined}
              className={cn(
                "h-10 gap-2 rounded-full px-6 font-medium text-primary-foreground",
                blockingReason && "opacity-50"
              )}
            >
              {generating || optimizing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {optimizing ? "Directing…" : "Generating…"}
                </>
              ) : mode === "plain" ? (
                <>
                  <Plus className="size-4" /> Generate
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Direct VO
                </>
              )}
            </Button>
          </div>
        )}

        {audioSrc && (
          <div className="space-y-3 rounded-xl border border-white/8 bg-black/40 p-4">
            <Waveform src={audioSrc} />
            <audio src={audioSrc} controls className="w-full" />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-full px-3 text-xs"
                onClick={() => void downloadAudio()}
              >
                <Download className="size-3.5" /> Download
              </Button>
              {result && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-full px-3 text-xs"
                  onClick={() => void shareGeneration(result)}
                >
                  <Link2 className="size-3.5" /> Share
                </Button>
              )}
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
              Versions
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
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                {currentGroupId
                  ? "Every version of this script, oldest first."
                  : "Nothing loaded yet."}
              </p>
              {currentGroupId && (
                <button
                  type="button"
                  onClick={startFresh}
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Start a new script
                </button>
              )}
            </div>

            {versionsLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
            ) : versions.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                {currentGroupId
                  ? "Generating…"
                  : "Generate something to see its versions here. Everything else the team has made lives in Library."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {[...versions].reverse().map((g, idx) => (
                  <div
                    key={g.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-lg border p-2.5 transition hover:bg-white/[0.03]",
                      g.id === result?.id ? "border-gold/40 bg-gold-soft/10" : "border-white/8"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => loadIntoEditor(g)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium">
                          Version {idx + 1}
                          {g.id === result?.id && (
                            <span className="ml-1.5 text-gold">· current</span>
                          )}
                        </span>
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
                          new Date(g.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          }),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </button>
                    {g.status === "ready" && (
                      <button
                        type="button"
                        onClick={() => void shareGeneration(g)}
                        className="shrink-0 rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-white/8 hover:text-foreground group-hover:opacity-100"
                        title="Share"
                      >
                        <Link2 className="size-3.5" />
                      </button>
                    )}
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
        favoriteVoiceIds={favoriteVoiceIds}
        onToggleFavorite={(voice) => void toggleFavorite(voice)}
      />

      <GeneratingOverlay open={generating} multiSpeaker={speechBlocks.length > 1} />

      <TtsScriptDiffDialog
        open={diffOpen}
        onOpenChange={setDiffOpen}
        rows={diffRows}
        onEditRow={(id, text) => void applyDiffEdit(id, text)}
        title="Pronunciation editor"
      />
    </div>
  );
}

type Stage = { atS: number; label: string };

const SINGLE_SPEAKER_STAGES: Stage[] = [
  { atS: 0, label: "Reading your script…" },
  { atS: 1.5, label: "Synthesizing speech…" },
  { atS: 6, label: "Adding finishing touches…" },
];

const MULTI_SPEAKER_STAGES: Stage[] = [
  { atS: 0, label: "Reading your script…" },
  { atS: 1.5, label: "Synthesizing each speaker…" },
  { atS: 6, label: "Mixing speakers together…" },
  { atS: 10, label: "Adding finishing touches…" },
];

/** Time constant (s) for the eased bar — voice-overs land in seconds, not minutes. */
const TAU_S = 7;

function useElapsedSeconds(active: boolean) {
  const [elapsedS, setElapsedS] = useState(0);
  useEffect(() => {
    if (!active) {
      setElapsedS(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedS((Date.now() - startedAt) / 1000);
    }, 200);
    return () => clearInterval(timer);
  }, [active]);
  return elapsedS;
}

/**
 * Blocking popup shown while a generation is in flight — a spinner-in-a-
 * button was easy to miss, especially for the longer multi-speaker case.
 * Non-dismissable on purpose: there's nothing useful to do until it lands.
 */
function GeneratingOverlay({ open, multiSpeaker }: { open: boolean; multiSpeaker: boolean }) {
  const elapsedS = useElapsedSeconds(open);
  const stages = multiSpeaker ? MULTI_SPEAKER_STAGES : SINGLE_SPEAKER_STAGES;
  let label = stages[0].label;
  for (const s of stages) {
    if (elapsedS >= s.atS) label = s.label;
  }
  const progress = Math.min(0.95, 1 - Math.exp(-elapsedS / TAU_S));

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} className="gap-5 p-8 text-center sm:max-w-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gold-soft ring-1 ring-gold/25">
          <Mic className="size-6 animate-pulse text-gold" />
        </div>
        <div className="space-y-1">
          <p key={label} className="animate-in fade-in text-sm font-medium duration-500">
            {label}
          </p>
          <p className="text-xs text-muted-foreground">{elapsedS.toFixed(0)}s</p>
        </div>
        <ProgressBar value={progress} />
      </DialogContent>
    </Dialog>
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
