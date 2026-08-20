"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Clapperboard,
  Copy,
  Download,
  Languages,
  Link2,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  Search,
  Sparkles,
  SkipBack,
  SkipForward,
  Merge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, postJson, readJson } from "@/lib/utils";
import {
  extractAudioChunks,
  fetchStoredMedia,
} from "@/lib/audio-extract";
import {
  formatClock,
  speakerLabel,
  toPlainText,
  toSrt,
  type SubtitleSegment,
} from "@/lib/subtitles";
import type {
  TranscriptRecord,
  TranscriptSegmentRecord,
} from "@/lib/types";

type Props = {
  transcriptId: string;
  onBack: () => void;
  onChanged?: () => void;
  onOpenStoryboard?: (storyboardId: string) => void;
};

type Rail = "insights" | "ask" | "export";

const EXPORT_FORMATS = [
  { id: "srt", label: "SRT subtitles", hint: "Premiere, Resolve, YouTube" },
  { id: "vtt", label: "VTT subtitles", hint: "Web players" },
  { id: "txt", label: "Plain text", hint: "Paste into a doc" },
  { id: "md", label: "Markdown", hint: "Timecoded, for notes" },
  { id: "csv", label: "CSV", hint: "One row per line" },
  { id: "json", label: "JSON", hint: "Words and timings" },
] as const;

const TRANSLATION_LANGUAGES = [
  { id: "ar", label: "Arabic" },
  { id: "en", label: "English" },
  { id: "fr", label: "French" },
  { id: "es", label: "Spanish" },
  { id: "tr", label: "Turkish" },
  { id: "ur", label: "Urdu" },
  { id: "hi", label: "Hindi" },
  { id: "zh", label: "Chinese (Simplified)" },
];

/** Arabic and Urdu read right to left; the transcript column has to follow. */
const RTL_LANGUAGES = new Set(["ar", "fa", "ur", "he"]);

export function TranscriptDetail({
  transcriptId,
  onBack,
  onChanged,
  onOpenStoryboard,
}: Props) {
  const [transcript, setTranscript] = useState<TranscriptRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [segments, setSegments] = useState<TranscriptSegmentRecord[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [rail, setRail] = useState<Rail>("insights");
  const [busy, setBusy] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<
    { question: string; answer: string; citations: { start_s: number; quote: string }[] }[]
  >([]);
  const [exportOptions, setExportOptions] = useState({
    speakers: true,
    clean: false,
    timestamps: "speaker" as "none" | "speaker" | "interval" | "segment",
    lang: "",
  });

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const isVideo = transcript?.media_kind === "video";
  const speakerNames = transcript?.speaker_names ?? {};
  const rtl = RTL_LANGUAGES.has(transcript?.language ?? "");

  const load = useCallback(
    async (withSegments = true) => {
      const res = await fetch(
        `/api/transcripts/${transcriptId}?segments=${withSegments}`
      );
      const json = await readJson<{ transcript?: TranscriptRecord; error?: string }>(res);
      if (!res.ok || !json.transcript) {
        throw new Error(json.error ?? "Could not open that transcript");
      }
      setTranscript(json.transcript);
      if (withSegments) setSegments(json.transcript.segments ?? []);
      return json.transcript;
    },
    [transcriptId]
  );

  useEffect(() => {
    let alive = true;
    // `loading` already starts true, so there is nothing to set here — and
    // setting it inside the effect is a cascading render for no reason.
    load()
      .catch((err) => alive && toast.error(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load]);

  // Still working: poll until it lands. Progress-only requests skip the
  // segments, which on a long interview is most of the payload.
  const status = transcript?.status;
  useEffect(() => {
    if (status !== "queued" && status !== "running") return;
    const timer = setInterval(() => {
      load(false)
        .then((next) => {
          if (next.status === "ready") {
            void load(true);
            onChanged?.();
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [status, load, onChanged]);

  /**
   * `timeupdate` fires about four times a second, which is fine for a
   * progress bar and useless for highlighting the word being said. So the
   * clock is read on every animation frame while playing, and left alone
   * when paused.
   */
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const media = mediaRef.current;
      if (media) setCurrentTime(media.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const seek = useCallback((seconds: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = Math.max(0, seconds);
    setCurrentTime(media.currentTime);
  }, []);

  const togglePlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) void media.play();
    else media.pause();
  }, []);

  const nudge = useCallback(
    (delta: number) => {
      const media = mediaRef.current;
      if (media) seek(media.currentTime + delta);
    },
    [seek]
  );

  // Transcription is a two-handed job: one hand on the keyboard, one on the
  // text. These are the shortcuts a transcription pedal would send.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;

      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        nudge(-3);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        nudge(3);
      } else if (event.key === "f") {
        setFollow((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, nudge]);

  const activeIndex = useMemo(() => {
    if (!segments.length) return -1;
    // Linear is fine: a two-hour interview is a few thousand segments and
    // this runs once per frame on an array that is already in cache.
    let found = -1;
    for (let i = 0; i < segments.length; i++) {
      if (currentTime >= segments[i].start_s) found = i;
      else break;
    }
    if (found >= 0 && currentTime > segments[found].end_s + 2) return -1;
    return found;
  }, [segments, currentTime]);

  useEffect(() => {
    if (!follow || !activeRowRef.current) return;
    activeRowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex, follow]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(
      segments.filter((s) => s.text.toLowerCase().includes(q)).map((s) => s.id)
    );
  }, [query, segments]);

  const subtitleSegments: SubtitleSegment[] = useMemo(
    () =>
      segments.map((s) => ({
        start_s: s.start_s,
        end_s: s.end_s,
        text: s.text,
        speaker: s.speaker,
        words: s.words,
        translations: s.translations,
      })),
    [segments]
  );

  // --- edits ---------------------------------------------------------------

  const saveSegment = async (segment: TranscriptSegmentRecord, text: string) => {
    setEditingId(null);
    if (text.trim() === segment.text.trim()) return;
    // Optimistic: the correction is already on screen, and putting it back
    // because a round trip is slow would be worse than the risk.
    setSegments((prev) =>
      prev.map((s) => (s.id === segment.id ? { ...s, text, edited: true, words: [] } : s))
    );
    const res = await fetch(`/api/transcripts/${transcriptId}/segments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segmentId: segment.id, text }),
    });
    if (!res.ok) {
      toast.error("That edit did not save");
      void load();
    }
  };

  const segmentAction = async (
    action: "merge" | "split",
    segment: TranscriptSegmentRecord,
    wordIndex?: number
  ) => {
    const { res, json } = await postJson<{
      segments?: TranscriptSegmentRecord[];
      error?: string;
    }>(`/api/transcripts/${transcriptId}/segments`, {
      action,
      segmentId: segment.id,
      wordIndex,
    });
    if (!res.ok || !json.segments) {
      toast.error(json.error ?? "Could not do that");
      return;
    }
    setSegments(json.segments);
  };

  const saveSpeakerName = async (speaker: string, name: string) => {
    setRenaming(null);
    setTranscript((prev) =>
      prev
        ? {
            ...prev,
            speaker_names: { ...prev.speaker_names, [speaker]: name.trim() },
          }
        : prev
    );
    const res = await fetch(`/api/transcripts/${transcriptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speakerNames: { [speaker]: name } }),
    });
    if (!res.ok) toast.error("Could not rename that speaker");
    else onChanged?.();
  };

  /**
   * Run it again.
   *
   * The audio is decoded in the browser, so a re-run means fetching the media
   * back out of storage and replaying the chunks — there is no server-side
   * copy of the audio to work from.
   */
  const retry = async () => {
    setBusy("retry");
    try {
      const { res, json } = await postJson<{ error?: string }>(
        `/api/transcripts/${transcriptId}/retry`,
        {}
      );
      if (!res.ok) throw new Error(json.error ?? "Could not retry");

      const media = await fetchStoredMedia(transcript!.media_url);
      const { chunks } = await extractAudioChunks(media);
      for (const chunk of chunks) {
        const form = new FormData();
        form.append(
          "audio",
          new Blob([chunk.wav], { type: "audio/wav" }),
          `chunk-${chunk.index}.wav`
        );
        form.append("index", String(chunk.index));
        form.append("total", String(chunks.length));
        form.append("offsetS", String(chunk.startS));
        const chunkRes = await fetch(`/api/transcripts/${transcriptId}/chunk`, {
          method: "POST",
          body: form,
        });
        if (!chunkRes.ok) {
          const body = await readJson<{ error?: string }>(chunkRes);
          throw new Error(body.error ?? "Transcription failed");
        }
      }
      toast.success("Transcript ready");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not retry");
      await load();
    } finally {
      setBusy(null);
    }
  };

  // --- the AI layer --------------------------------------------------------

  const runInsights = async (refresh = false) => {
    setBusy("insights");
    try {
      const { res, json } = await postJson<{
        insights?: TranscriptRecord["insights"];
        error?: string;
      }>(`/api/transcripts/${transcriptId}/insights?refresh=${refresh}`, {});
      if (!res.ok || !json.insights) throw new Error(json.error ?? "Nothing came back");
      setTranscript((prev) => (prev ? { ...prev, insights: json.insights! } : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read it");
    } finally {
      setBusy(null);
    }
  };

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setBusy("ask");
    setQuestion("");
    try {
      const { res, json } = await postJson<{
        answer?: string;
        citations?: { start_s: number; quote: string }[];
        error?: string;
      }>(`/api/transcripts/${transcriptId}/ask`, { question: q });
      if (!res.ok || !json.answer) throw new Error(json.error ?? "No answer");
      setAnswers((prev) => [
        ...prev,
        { question: q, answer: json.answer!, citations: json.citations ?? [] },
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not answer that");
    } finally {
      setBusy(null);
    }
  };

  const translate = async (lang: string) => {
    setBusy("translate");
    try {
      const { res, json } = await postJson<{
        translated?: number;
        total?: number;
        error?: string;
      }>(`/api/transcripts/${transcriptId}/translate`, { lang });
      if (!res.ok) throw new Error(json.error ?? "Translation failed");
      toast.success(`Translated ${json.translated}/${json.total} lines`);
      setExportOptions((prev) => ({ ...prev, lang }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Translation failed");
    } finally {
      setBusy(null);
    }
  };

  const toStoryboard = async () => {
    setBusy("storyboard");
    try {
      const { res, json } = await postJson<{
        storyboard?: { id: string };
        error?: string;
      }>(`/api/transcripts/${transcriptId}/storyboard`, {});
      if (!res.ok || !json.storyboard) throw new Error(json.error ?? "Could not plan it");
      toast.success("Board created from this recording");
      onOpenStoryboard?.(json.storyboard.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not plan it");
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    const { res, json } = await postJson<{ path?: string; error?: string }>(
      `/api/transcripts/${transcriptId}/share`,
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

  const exportUrl = (format: string) => {
    const params = new URLSearchParams({
      format,
      speakers: String(exportOptions.speakers),
      clean: String(exportOptions.clean),
      timestamps: exportOptions.timestamps,
    });
    if (exportOptions.lang) params.set("lang", exportOptions.lang);
    return `/api/transcripts/${transcriptId}/export?${params}`;
  };

  const copyText = async (format: "txt" | "srt") => {
    const text =
      format === "srt"
        ? toSrt(subtitleSegments, {
            speakers: exportOptions.speakers,
            speakerNames,
            bilingualLang: exportOptions.lang || null,
          })
        : toPlainText(subtitleSegments, {
            speakers: exportOptions.speakers,
            speakerNames,
            clean: exportOptions.clean,
            timestamps: exportOptions.timestamps,
          });
    try {
      await navigator.clipboard.writeText(text);
      toast.success(format === "srt" ? "Subtitles copied" : "Transcript copied");
    } catch {
      toast.error("Clipboard blocked — use Download instead");
    }
  };

  // --- render --------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (!transcript) return null;

  const working = transcript.status === "queued" || transcript.status === "running";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/5 px-1 pb-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="size-4" /> All transcripts
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">{transcript.title}</h2>
          <p className="text-xs text-muted-foreground">
            {[
              transcript.duration_s ? formatClock(transcript.duration_s) : null,
              transcript.language?.toUpperCase(),
              transcript.client_name,
              transcript.model,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={share} className="gap-2">
          <Link2 className="size-4" /> Share
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={toStoryboard}
          disabled={busy === "storyboard" || working}
          className="gap-2"
        >
          {busy === "storyboard" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Clapperboard className="size-4" />
          )}
          Storyboard this
        </Button>
      </header>

      {working && (
        <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.02] p-4">
          <div className="flex items-center gap-3 text-sm">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="capitalize">{transcript.stage || "queued"}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">
              {Math.round(transcript.progress)}%
            </span>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full bg-foreground/60 transition-all"
              style={{ width: `${Math.max(2, transcript.progress)}%` }}
            />
          </div>
        </div>
      )}

      {transcript.status === "failed" && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium">Transcription failed</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {transcript.error}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={busy === "retry"}
            onClick={() => void retry()}
          >
            {busy === "retry" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            Retry
          </Button>
        </div>
      )}

      <div className="mt-4 grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-h-0 flex-col gap-3">
          {/* Player */}
          <div className="overflow-hidden rounded-xl border border-white/8 bg-black/40">
            {isVideo ? (
              <video
                ref={mediaRef as React.RefObject<HTMLVideoElement>}
                src={transcript.media_url}
                className="max-h-[38vh] w-full bg-black"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                controls
              />
            ) : (
              <audio
                ref={mediaRef as React.RefObject<HTMLAudioElement>}
                src={transcript.media_url}
                className="w-full"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                controls
              />
            )}
          </div>

          {/* Transport + search */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => nudge(-3)}>
              <SkipBack className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={togglePlay}>
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <Button variant="outline" size="icon" onClick={() => nudge(3)}>
              <SkipForward className="size-4" />
            </Button>
            <span className="ml-1 tabular-nums text-xs text-muted-foreground">
              {formatClock(currentTime)}
              {transcript.duration_s ? ` / ${formatClock(transcript.duration_s)}` : ""}
            </span>
            <Button
              variant={follow ? "secondary" : "outline"}
              size="sm"
              onClick={() => setFollow((f) => !f)}
              className="ml-auto"
            >
              {follow ? "Following" : "Follow"}
            </Button>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find in transcript"
                className="h-9 w-44 pl-8 text-xs"
              />
            </div>
          </div>
          {query.trim() && (
            <p className="text-xs text-muted-foreground">
              {matches.size} {matches.size === 1 ? "line" : "lines"} match
            </p>
          )}

          {/* Transcript */}
          <div
            className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/8 bg-white/[0.015] p-3"
            dir={rtl ? "rtl" : "ltr"}
          >
            {segments.length === 0 && !working && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No speech was found in this recording.
              </p>
            )}
            {segments.map((segment, index) => {
              const previous = segments[index - 1];
              const startsTurn = !previous || previous.speaker !== segment.speaker;
              const active = index === activeIndex;
              return (
                <div
                  key={segment.id}
                  ref={active ? activeRowRef : undefined}
                  className={cn(
                    "group rounded-lg px-3 py-2 transition",
                    active && "bg-white/[0.06]",
                    matches.has(segment.id) && "ring-1 ring-amber-400/40"
                  )}
                >
                  {startsTurn && (
                    <div className="mb-1 flex items-center gap-2">
                      {renaming === segment.speaker ? (
                        <Input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() =>
                            saveSpeakerName(segment.speaker ?? "", renameValue)
                          }
                          onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
                            if (e.key === "Enter")
                              saveSpeakerName(segment.speaker ?? "", renameValue);
                            if (e.key === "Escape") setRenaming(null);
                          }}
                          className="h-7 w-40 text-xs"
                          placeholder="Name this speaker"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (!segment.speaker) return;
                            setRenaming(segment.speaker);
                            setRenameValue(speakerLabel(segment.speaker, speakerNames));
                          }}
                          className="text-xs font-medium text-foreground/80 hover:text-foreground"
                        >
                          {speakerLabel(segment.speaker, speakerNames) || "Speaker"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => seek(segment.start_s)}
                        className="tabular-nums text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        {formatClock(segment.start_s)}
                      </button>
                    </div>
                  )}

                  {editingId === segment.id ? (
                    <Textarea
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => saveSegment(segment, draft)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingId(null);
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          saveSegment(segment, draft);
                        }
                      }}
                      className="min-h-[64px] text-sm"
                    />
                  ) : (
                    <div className="flex items-start gap-2">
                      <p
                        className="flex-1 cursor-text text-sm leading-relaxed"
                        onDoubleClick={() => {
                          setEditingId(segment.id);
                          setDraft(segment.text);
                        }}
                      >
                        {segment.words.length > 0 ? (
                          segment.words.map((word, wordIndex) => {
                            const spoken =
                              currentTime >= word.s && currentTime <= word.e;
                            return (
                              <span
                                key={`${segment.id}-${wordIndex}`}
                                onClick={() => seek(word.s)}
                                className={cn(
                                  "cursor-pointer rounded px-0.5 transition-colors",
                                  spoken
                                    ? "bg-amber-300/25 text-foreground"
                                    : "hover:bg-white/8"
                                )}
                              >
                                {word.w}{" "}
                              </span>
                            );
                          })
                        ) : (
                          <span
                            onClick={() => seek(segment.start_s)}
                            className="cursor-pointer"
                          >
                            {segment.text}
                          </span>
                        )}
                      </p>
                      <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                        {index > 0 && (
                          <button
                            type="button"
                            title="Merge into the line above"
                            onClick={() => segmentAction("merge", segment)}
                            className="rounded p-1 text-muted-foreground hover:bg-white/8 hover:text-foreground"
                          >
                            <Merge className="size-3.5" />
                          </button>
                        )}
                        {segment.words.length > 2 && (
                          <button
                            type="button"
                            title="Split this line in half"
                            onClick={() =>
                              segmentAction(
                                "split",
                                segment,
                                Math.floor(segment.words.length / 2)
                              )
                            }
                            className="rounded p-1 text-muted-foreground hover:bg-white/8 hover:text-foreground"
                          >
                            <Scissors className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Space plays · ← → jump 3s · F follows · double-click a line to correct it
          </p>
        </div>

        {/* Right rail */}
        <div className="flex min-h-0 flex-col rounded-xl border border-white/8 bg-white/[0.015]">
          <div className="flex border-b border-white/8 p-1">
            {(
              [
                ["insights", "Read", Sparkles],
                ["ask", "Ask", MessageSquare],
                ["export", "Export", Download],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRail(id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs transition",
                  rail === id
                    ? "bg-white/8 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {rail === "insights" && (
              <InsightsRail
                transcript={transcript}
                busy={busy === "insights"}
                onRun={runInsights}
                onSeek={seek}
              />
            )}

            {rail === "ask" && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Ask about this recording. Answers come back with the timecode
                  they were said at.
                </p>
                {answers.map((entry, i) => (
                  <div key={i} className="space-y-2 rounded-lg bg-white/[0.03] p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {entry.question}
                    </p>
                    <p className="text-sm leading-relaxed">{entry.answer}</p>
                    {entry.citations.map((citation, c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => seek(citation.start_s)}
                        className="block w-full rounded border-l-2 border-white/20 bg-black/20 px-2 py-1 text-left text-xs text-muted-foreground hover:text-foreground"
                      >
                        <span className="tabular-nums">
                          {formatClock(citation.start_s)}
                        </span>{" "}
                        — “{citation.quote}”
                      </button>
                    ))}
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && ask()}
                    placeholder="What did they decide about the launch?"
                    className="text-xs"
                  />
                  <Button size="sm" onClick={ask} disabled={busy === "ask"}>
                    {busy === "ask" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Ask"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {rail === "export" && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-medium">Options</p>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={exportOptions.speakers}
                      onChange={(e) =>
                        setExportOptions((o) => ({ ...o, speakers: e.target.checked }))
                      }
                    />
                    Include speaker names
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={exportOptions.clean}
                      onChange={(e) =>
                        setExportOptions((o) => ({ ...o, clean: e.target.checked }))
                      }
                    />
                    Clean script (drop fillers)
                  </label>
                  <Select
                    value={exportOptions.timestamps}
                    onValueChange={(value) =>
                      setExportOptions((o) => ({
                        ...o,
                        timestamps: value as typeof o.timestamps,
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No timecodes</SelectItem>
                      <SelectItem value="speaker">Per speaker turn</SelectItem>
                      <SelectItem value="interval">Every minute</SelectItem>
                      <SelectItem value="segment">Every line</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium">Subtitle language</p>
                  <Select
                    value={exportOptions.lang || "original"}
                    onValueChange={(value) =>
                      setExportOptions((o) => ({
                        ...o,
                        lang: value === "original" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="original">Original only</SelectItem>
                      {TRANSLATION_LANGUAGES.map((language) => (
                        <SelectItem key={language.id} value={language.id}>
                          Bilingual — {language.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {exportOptions.lang && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      disabled={busy === "translate"}
                      onClick={() => translate(exportOptions.lang)}
                    >
                      {busy === "translate" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Languages className="size-4" />
                      )}
                      Translate now
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium">Download</p>
                  {EXPORT_FORMATS.map((format) => (
                    <a
                      key={format.id}
                      href={exportUrl(format.id)}
                      className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                    >
                      <span>{format.label}</span>
                      <span className="text-[10px] opacity-60">{format.hint}</span>
                    </a>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => copyText("txt")}
                  >
                    <Copy className="size-3.5" /> Text
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => copyText("srt")}
                  >
                    <Copy className="size-3.5" /> SRT
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InsightsRail({
  transcript,
  busy,
  onRun,
  onSeek,
}: {
  transcript: TranscriptRecord;
  busy: boolean;
  onRun: (refresh?: boolean) => void;
  onSeek: (seconds: number) => void;
}) {
  const insights = transcript.insights;

  if (!insights) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-xs text-muted-foreground">
          Summary, decisions, chapters, and the clips worth cutting — read out of
          what was actually said.
        </p>
        <p className="text-[11px] text-muted-foreground/70">
          Transcribing is local and free. This step, translation and Ask send
          the text to a chat model, which is billed to the studio&rsquo;s key.
        </p>
        <Button
          size="sm"
          className="w-full gap-2"
          disabled={busy || transcript.status !== "ready"}
          onClick={() => onRun(false)}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Read this for me
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-xs font-medium">Summary</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {insights.summary}
        </p>
      </section>

      {insights.key_points.length > 0 && (
        <section>
          <h3 className="text-xs font-medium">Key points</h3>
          <ul className="mt-1.5 space-y-1.5">
            {insights.key_points.map((point, i) => (
              <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                <Check className="mt-0.5 size-3 shrink-0" />
                {point}
              </li>
            ))}
          </ul>
        </section>
      )}

      {insights.action_items.length > 0 && (
        <section>
          <h3 className="text-xs font-medium">Actions</h3>
          <ul className="mt-1.5 space-y-1.5">
            {insights.action_items.map((item, i) => (
              <li key={i} className="text-xs">
                <button
                  type="button"
                  onClick={() => onSeek(item.start_s)}
                  className="tabular-nums text-muted-foreground hover:text-foreground"
                >
                  {formatClock(item.start_s)}
                </button>{" "}
                <span>{item.task}</span>{" "}
                <span className="text-muted-foreground">— {item.owner}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {insights.chapters.length > 0 && (
        <section>
          <h3 className="text-xs font-medium">Chapters</h3>
          <ul className="mt-1.5 space-y-1">
            {insights.chapters.map((chapter, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onSeek(chapter.start_s)}
                  className="flex w-full gap-2 rounded px-1 py-0.5 text-left text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
                >
                  <span className="tabular-nums">{formatClock(chapter.start_s)}</span>
                  <span>{chapter.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {insights.clips.length > 0 && (
        <section>
          <h3 className="text-xs font-medium">Clips worth cutting</h3>
          <div className="mt-1.5 space-y-2">
            {insights.clips.map((clip, i) => (
              <div key={i} className="rounded-lg bg-white/[0.03] p-2.5">
                <button
                  type="button"
                  onClick={() => onSeek(clip.start_s)}
                  className="tabular-nums text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {formatClock(clip.start_s)} – {formatClock(clip.end_s)}
                </button>
                <p className="mt-1 text-xs leading-relaxed">“{clip.quote}”</p>
                {clip.caption && (
                  <p className="mt-1.5 border-t border-white/8 pt-1.5 text-[11px] text-muted-foreground">
                    {clip.caption}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="w-full gap-2 text-xs"
        disabled={busy}
        onClick={() => onRun(true)}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
        Read it again
      </Button>
    </div>
  );
}
