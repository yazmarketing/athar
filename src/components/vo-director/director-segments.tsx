"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Check, X as XIcon, Wand2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { readJson } from "@/lib/utils";
import type { MunsitVoice, TtsDirectorSegment, TtsDirectorTake } from "@/lib/types";

type Props = {
  segments: TtsDirectorSegment[];
  onSegmentsChange: (segments: TtsDirectorSegment[]) => void;
  voices: MunsitVoice[] | null;
  defaultVoiceId: string;
};

/** Director Mode's per-segment breakdown: direction, editable phonetics, and take picker. */
export function DirectorSegmentList({ segments, onSegmentsChange, voices, defaultVoiceId }: Props) {
  const patchSegment = (id: string, patch: Partial<TtsDirectorSegment>) => {
    onSegmentsChange(segments.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  return (
    <div className="space-y-3">
      {segments.map((segment) => (
        <SegmentCard
          key={segment.id}
          segment={segment}
          voices={voices}
          defaultVoiceId={defaultVoiceId}
          onChange={(patch) => patchSegment(segment.id, patch)}
        />
      ))}
    </div>
  );
}

function SegmentCard({
  segment,
  voices,
  defaultVoiceId,
  onChange,
}: {
  segment: TtsDirectorSegment;
  voices: MunsitVoice[] | null;
  defaultVoiceId: string;
  onChange: (patch: Partial<TtsDirectorSegment>) => void;
}) {
  const [savingText, setSavingText] = useState(false);
  const [generatingTakes, setGeneratingTakes] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const voiceId = segment.voice_id || defaultVoiceId;

  const saveText = async (tts: string) => {
    setSavingText(true);
    try {
      const res = await fetch(`/api/tts/director/segments/${segment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tts }),
      });
      const json = await readJson<{ segment?: TtsDirectorSegment; error?: string }>(res);
      if (!res.ok || !json.segment) throw new Error(json.error ?? "Could not save");
      onChange(json.segment);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the edit");
    } finally {
      setSavingText(false);
    }
  };

  const setVoice = async (nextVoiceId: string) => {
    const voice = voices?.find((v) => v.voice_id === nextVoiceId);
    onChange({ voice_id: nextVoiceId });
    await fetch(`/api/tts/director/segments/${segment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId: nextVoiceId }),
    }).catch(() => {});
    void voice;
  };

  const generateTakes = async () => {
    if (!voiceId) {
      toast.error("Pick a voice first");
      return;
    }
    setGeneratingTakes(true);
    try {
      const res = await fetch("/api/tts/director/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId: segment.id, voiceId }),
      });
      const json = await readJson<{ takes?: TtsDirectorTake[]; error?: string }>(res);
      if (!res.ok || !json.takes) throw new Error(json.error ?? "Could not generate takes");
      onChange({ takes: [...(segment.takes ?? []), ...json.takes] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate takes");
    } finally {
      setGeneratingTakes(false);
    }
  };

  const pickTake = async (take: TtsDirectorTake) => {
    setSelecting(take.id);
    try {
      const rejected = (segment.takes ?? []).filter((t) => t.id !== take.id).map((t) => t.id);
      const res = await fetch("/api/tts/director/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId: segment.id, selectedTakeId: take.id, rejectedTakeIds: rejected }),
      });
      if (!res.ok) throw new Error("Could not save that pick");
      onChange({ selected_take_id: take.id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that pick");
    } finally {
      setSelecting(null);
    }
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-white/8 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {segment.emotion && <Badge variant="outline">{segment.emotion}</Badge>}
        {segment.intensity != null && (
          <Badge variant="outline">{Math.round(segment.intensity * 100)}%</Badge>
        )}
        {segment.pace && <Badge variant="outline">{segment.pace}</Badge>}
        {savingText && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </div>

      <Textarea
        defaultValue={segment.tts || segment.spoken || segment.original}
        dir="rtl"
        rows={2}
        onBlur={(e) => {
          const value = e.target.value;
          if (value !== segment.tts) void saveText(value);
        }}
        className="resize-none text-sm leading-relaxed"
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={voiceId}
          onChange={(e) => void setVoice(e.target.value)}
          className="rounded-md bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10"
        >
          {!voiceId && <option value="">Choose a voice</option>}
          {voices?.map((v) => (
            <option key={v.voice_id} value={v.voice_id}>
              {v.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void generateTakes()}
          disabled={generatingTakes}
          className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] ring-1 ring-white/10 transition hover:ring-gold/40 disabled:opacity-50"
        >
          {generatingTakes ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Wand2 className="size-3" />
          )}
          Generate takes
        </button>
      </div>

      {(segment.takes?.length ?? 0) > 0 && (
        <div className="grid gap-1.5 sm:grid-cols-3">
          {segment.takes!.map((take, i) => {
            const isSelected = segment.selected_take_id === take.id;
            const label = String.fromCharCode(65 + i);
            return (
              <div
                key={take.id}
                className={`space-y-1 rounded-lg p-2 ring-1 ${
                  isSelected ? "bg-gold-soft/10 ring-gold/40" : "bg-white/[0.03] ring-white/10"
                }`}
              >
                <p className="text-[11px] font-medium">
                  ▶ Take {label} <span className="text-muted-foreground">· {take.preset}</span>
                </p>
                {take.status === "ready" && take.output_url ? (
                  <audio src={take.output_url} controls className="h-8 w-full" />
                ) : (
                  <p className="text-[11px] text-destructive">{take.error ?? "Failed"}</p>
                )}
                {take.status === "ready" && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void pickTake(take)}
                      disabled={selecting === take.id}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11px] transition ${
                        isSelected
                          ? "bg-gold text-primary-foreground"
                          : "bg-white/5 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {selecting === take.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Check className="size-3" />
                      )}
                      Pick
                    </button>
                    {isSelected && (
                      <button
                        type="button"
                        onClick={() => onChange({ selected_take_id: null })}
                        className="flex items-center justify-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] text-muted-foreground transition hover:text-destructive"
                      >
                        <XIcon className="size-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
