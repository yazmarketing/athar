"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CircleDot,
  FileAudio,
  Film,
  Loader2,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TranscriptDetail } from "@/components/transcript-detail";
import { formatClock } from "@/lib/subtitles";
import {
  UnsupportedMediaError,
  extractAudioChunks,
  type ExtractedChunk,
} from "@/lib/audio-extract";
import { cn, postJson, readJson } from "@/lib/utils";
import type { ClientRecord, TranscriptRecord } from "@/lib/types";

type Props = {
  clients: ClientRecord[];
  defaultClientId?: string | null;
  defaultProjectId?: string | null;
  isAdmin?: boolean;
  onOpenStoryboard?: (storyboardId: string) => void;
};

/** Select can't hold an empty value, so "no client" needs a sentinel. */
const NO_CLIENT = "__none__";

const LANGUAGES = [
  { id: "auto", label: "Detect automatically" },
  { id: "ar", label: "Arabic" },
  { id: "en", label: "English" },
  { id: "fr", label: "French" },
  { id: "es", label: "Spanish" },
  { id: "hi", label: "Hindi" },
  { id: "ur", label: "Urdu" },
  { id: "tr", label: "Turkish" },
];

type EngineStatus = {
  configured?: boolean;
  ok?: boolean;
  label?: string;
  detail?: string;
  /**
   * The worker only labels speakers when it has a Hugging Face token, so the
   * UI asks rather than assumes.
   */
  capabilities?: {
    diarization: boolean;
    translate: boolean;
    progress: boolean;
  };
  error?: string;
};

type SearchHit = {
  transcript_id: string;
  title: string;
  segment_id: string;
  start_s: number;
  speaker: string | null;
  text: string;
  client_name: string | null;
};

export function Transcribe({
  clients,
  defaultClientId,
  defaultProjectId,
  isAdmin,
  onOpenStoryboard,
}: Props) {
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  /** What the box under the drop zone is doing right now. */
  const [job, setJob] = useState<{
    name: string;
    stage: "reading" | "uploading" | "transcribing";
    percent: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  const [options, setOptions] = useState({
    language: "auto",
    task: "transcribe" as "transcribe" | "translate",
    clientId: defaultClientId ?? null,
    vocabulary: "",
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/transcripts");
    const json = await readJson<{ transcripts?: TranscriptRecord[] }>(res);
    setTranscripts(json.transcripts ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch(() => toast.error("Could not load transcripts"))
      .finally(() => setLoading(false));
    fetch("/api/transcripts/status")
      .then((res) => res.json())
      .then(setEngine)
      .catch(() => setEngine({ configured: false, ok: false }));
  }, [load]);

  // Anything still decoding: refresh the list so the bars move without
  // anyone having to reload the page.
  const working = transcripts.some(
    (t) => t.status === "queued" || t.status === "running"
  );
  useEffect(() => {
    if (!working || openId) return;
    const timer = setInterval(() => void load().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [working, openId, load]);

  // --- upload --------------------------------------------------------------

  /**
   * Straight to storage where the Space allows it, through the app where it
   * doesn't. A two-hour interview is gigabytes, and pushing that through a
   * Node process buffers the whole file in memory for no reason.
   */
  const uploadFile = async (file: File): Promise<{ url: string; kind: "audio" | "video" }> => {
    try {
      const { res, json } = await postJson<{
        uploadUrl?: string;
        publicUrl?: string;
        mediaKind?: "audio" | "video";
        error?: string;
      }>("/api/transcripts/upload-url", {
        filename: file.name,
        contentType: file.type,
      });
      if (!res.ok || !json.uploadUrl || !json.publicUrl) {
        throw new Error(json.error ?? "Could not prepare the upload");
      }

      await putWithProgress(json.uploadUrl, file, (percent) =>
        setJob((j) => (j ? { ...j, stage: "uploading", percent } : j))
      );
      return { url: json.publicUrl, kind: json.mediaKind ?? "audio" };
    } catch (err) {
      // Most likely no CORS rule on the Space. The fallback is slower and
      // capped, but it means nobody is blocked on a storage setting.
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/transcripts/upload", { method: "POST", body: form });
      const json = await readJson<{
        publicUrl?: string;
        mediaKind?: "audio" | "video";
        error?: string;
      }>(res);
      if (!res.ok || !json.publicUrl) {
        throw new Error(json.error ?? (err instanceof Error ? err.message : "Upload failed"));
      }
      return { url: json.publicUrl, kind: json.mediaKind ?? "audio" };
    }
  };

  /**
   * Send the decoded chunks up one at a time.
   *
   * The browser holds the audio, so it drives: each request carries one chunk
   * and its offset, which keeps every call short and makes the progress bar
   * count real work. A cancelled job stops on the next chunk boundary.
   */
  const runChunks = async (
    transcriptId: string,
    chunks: ExtractedChunk[],
    onProgress?: (percent: number) => void
  ) => {
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

      const res = await fetch(`/api/transcripts/${transcriptId}/chunk`, {
        method: "POST",
        body: form,
      });
      const json = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Transcription failed");
      onProgress?.(Math.round(((chunk.index + 1) / chunks.length) * 100));
    }
  };

  const start = async (input: {
    mediaUrl: string;
    mediaKind: "audio" | "video";
    title: string;
    mediaBytes?: number;
    chunks: ExtractedChunk[];
  }) => {
    const { res, json } = await postJson<{
      transcript?: TranscriptRecord;
      error?: string;
    }>("/api/transcripts", {
      mediaUrl: input.mediaUrl,
      mediaKind: input.mediaKind,
      title: input.title,
      mediaBytes: input.mediaBytes,
      language: options.language === "auto" ? null : options.language,
      task: options.task,
      vocabulary: options.vocabulary,
      clientId: options.clientId,
      projectId: defaultProjectId ?? null,
    });
    if (!res.ok || !json.transcript) {
      toast.error(json.error ?? "Could not start that transcription");
      return;
    }

    const id = json.transcript.id;
    await load();
    setJob((j) => (j ? { ...j, stage: "transcribing", percent: 0 } : j));
    await runChunks(id, input.chunks, (percent) =>
      setJob((j) => (j ? { ...j, stage: "transcribing", percent } : j))
    );
    toast.success("Transcript ready");
    await load();
    setOpenId(id);
  };

  const handleFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      setJob({ name: file.name, stage: "reading", percent: 0 });
      try {
        // Audio first: if the browser cannot read this file, nothing has been
        // uploaded and nothing has been charged.
        const { chunks } = await extractAudioChunks(file, (fraction) =>
          setJob({ name: file.name, stage: "reading", percent: Math.round(fraction * 100) })
        );
        if (chunks.length === 0) {
          throw new Error("There is no audio in that file");
        }

        setJob({ name: file.name, stage: "uploading", percent: 0 });
        const { url, kind } = await uploadFile(file);
        await start({
          mediaUrl: url,
          mediaKind: kind,
          title: file.name.replace(/\.[^.]+$/, ""),
          mediaBytes: file.size,
          chunks,
        });
      } catch (err) {
        const message =
          err instanceof UnsupportedMediaError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Could not transcribe that";
        toast.error(message);
        await load();
      } finally {
        setJob(null);
      }
    }
  };

  // --- search --------------------------------------------------------------

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    const res = await fetch(`/api/transcripts/search?q=${encodeURIComponent(q)}`);
    const json = await readJson<{ hits?: SearchHit[] }>(res);
    setHits(json.hits ?? []);
  };

  const remove = async (transcript: TranscriptRecord) => {
    const res = await fetch(`/api/transcripts/${transcript.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete that");
      return;
    }
    toast.success("Deleted");
    await load();
  };

  if (openId) {
    return (
      <TranscriptDetail
        transcriptId={openId}
        onBack={() => {
          setOpenId(null);
          void load();
        }}
        onChanged={load}
        onOpenStoryboard={onOpenStoryboard}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Engine */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
            engine?.ok
              ? "bg-emerald-400/10 text-emerald-300"
              : "bg-amber-400/10 text-amber-300"
          )}
        >
          <CircleDot className="size-3" />
          {engine?.ok
            ? [engine.label, engine.detail].filter(Boolean).join(" · ")
            : engine?.configured === false
              ? "Engine not configured"
              : "Engine offline"}
        </span>
        {engine?.ok && !engine.capabilities?.diarization && (
          <span className="text-muted-foreground">
            Speaker labels unavailable on this engine
          </span>
        )}
        {engine && !engine.ok && engine.error && (
          <span className="text-muted-foreground">{engine.error}</span>
        )}
      </div>

      {/* New transcription */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border border-dashed p-6 transition",
          dragging ? "border-foreground/40 bg-white/[0.04]" : "border-white/12"
        )}
      >
        {job ? (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2 text-sm">
              <span>
                {job.stage === "reading"
                  ? "Reading the audio"
                  : job.stage === "uploading"
                    ? "Uploading"
                    : "Transcribing"}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {job.name}
              </span>
              <span className="tabular-nums text-xs text-muted-foreground">
                {job.percent}%
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full bg-foreground/60 transition-all"
                style={{ width: `${Math.max(2, job.percent)}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {job.stage === "reading"
                ? "The audio is pulled out here, so only a few MB ever leaves this machine."
                : "Keep this tab open until it finishes."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
                <Upload className="size-4" /> Choose audio or video
              </Button>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Or drop files here. The audio is pulled out in your browser, so a
              500MB video becomes a few MB — keep the tab open while it runs.
            </p>
          </>
        )}

        {/* Settings that apply to the next job */}
        <div className="mt-5 grid gap-3 border-t border-white/8 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground">Language</label>
            <Select
              value={options.language}
              onValueChange={(language) => setOptions((o) => ({ ...o, language }))}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((language) => (
                  <SelectItem key={language.id} value={language.id}>
                    {language.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {engine?.capabilities?.translate !== false && (
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground">Output</label>
            <Select
              value={options.task}
              onValueChange={(task) =>
                setOptions((o) => ({ ...o, task: task as "transcribe" | "translate" }))
              }
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transcribe">In the spoken language</SelectItem>
                <SelectItem value="translate">Translated to English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground">Client</label>
            <Select
              value={options.clientId ?? NO_CLIENT}
              onValueChange={(value) =>
                setOptions((o) => ({
                  ...o,
                  clientId: value === NO_CLIENT ? null : value,
                }))
              }
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CLIENT}>No client</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground">
              Names to spell right
            </label>
            <Input
              value={options.vocabulary}
              onChange={(e) => setOptions((o) => ({ ...o, vocabulary: e.target.value }))}
              placeholder="Ajman, Thmanyah, Yazan"
              className="h-9 text-xs"
            />
          </div>
        </div>

      </div>

      {/* Search every transcript */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value.trim()) setHits(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search everything ever said — “launch date”, “الميزانية”"
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={runSearch}>
          Search
        </Button>
      </div>

      {hits && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {hits.length} {hits.length === 1 ? "result" : "results"}
          </p>
          {hits.map((hit) => (
            <button
              key={hit.segment_id}
              type="button"
              onClick={() => setOpenId(hit.transcript_id)}
              className="block w-full rounded-lg border border-white/8 p-3 text-left transition hover:bg-white/[0.03]"
            >
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{hit.title}</span>
                {hit.client_name && <span>· {hit.client_name}</span>}
                <span className="tabular-nums">· {formatClock(hit.start_s)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm">{hit.text}</p>
            </button>
          ))}
        </div>
      )}

      {/* The list */}
      {loading ? (
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : transcripts.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nothing transcribed yet. Drop an interview in and it will be readable in
          a few minutes.
        </p>
      ) : (
        <div className="space-y-2">
          {transcripts.map((transcript) => (
            <div
              key={transcript.id}
              className="group flex items-center gap-3 rounded-lg border border-white/8 p-3 transition hover:bg-white/[0.03]"
            >
              <button
                type="button"
                onClick={() => setOpenId(transcript.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/5">
                  {transcript.media_kind === "video" ? (
                    <Film className="size-4" />
                  ) : (
                    <FileAudio className="size-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{transcript.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {[
                      transcript.duration_s ? formatClock(transcript.duration_s) : null,
                      transcript.language?.toUpperCase(),
                      transcript.speaker_count
                        ? `${transcript.speaker_count} speakers`
                        : null,
                      transcript.client_name,
                      transcript.created_by_name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>

              <StatusPill transcript={transcript} />

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => remove(transcript)}
                  className="rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-white/8 hover:text-foreground group-hover:opacity-100"
                  title="Delete"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function StatusPill({ transcript }: { transcript: TranscriptRecord }) {
  if (transcript.status === "ready") {
    return (
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {transcript.segment_count} lines
      </span>
    );
  }
  if (transcript.status === "failed") {
    return (
      <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
        Failed
      </span>
    );
  }
  if (transcript.status === "cancelled") {
    return (
      <span className="shrink-0 text-[11px] text-muted-foreground">Cancelled</span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
      <Loader2 className="size-3 animate-spin" />
      <span className="capitalize">{transcript.stage || "queued"}</span>
      <span className="tabular-nums">{Math.round(transcript.progress)}%</span>
    </span>
  );
}

/** XHR, not fetch: only XHR reports upload progress, and these files are big. */
function putWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    // Part of what was signed, so it has to be sent as well.
    xhr.setRequestHeader("x-amz-acl", "public-read");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage rejected the upload (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload blocked — no CORS rule on the Space"));
    xhr.send(file);
  });
}
