"use client";

import { useRef, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { formatClock, speakerLabel, toPlainText } from "@/lib/subtitles";
import { cn } from "@/lib/utils";
import type { TranscriptRecord, TranscriptSegmentRecord } from "@/lib/types";

const RTL_LANGUAGES = new Set(["ar", "fa", "ur", "he"]);

/**
 * The read-only view behind a share link. Same player-and-transcript pairing
 * as the studio, without anything that could change the record — the link
 * goes to people who do not have a login, and often past them.
 */
export function SharedTranscript({
  transcript,
  segments,
}: {
  transcript: TranscriptRecord;
  segments: TranscriptSegmentRecord[];
}) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const names = transcript.speaker_names ?? {};
  const rtl = RTL_LANGUAGES.has(transcript.language ?? "");

  const seek = (seconds: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = seconds;
    void media.play();
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(
        toPlainText(
          segments.map((s) => ({
            start_s: s.start_s,
            end_s: s.end_s,
            text: s.text,
            speaker: s.speaker,
          })),
          { speakerNames: names }
        )
      );
      toast.success("Transcript copied");
    } catch {
      toast.error("Clipboard blocked — select and copy manually");
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
        {!transcript.media_url ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Playback isn&apos;t available for this transcript.
          </p>
        ) : transcript.media_kind === "video" ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={transcript.media_url}
            controls
            className="max-h-[45vh] w-full bg-black"
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          />
        ) : (
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={transcript.media_url}
            controls
            className="w-full"
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          />
        )}
      </div>

      <button
        type="button"
        onClick={copyAll}
        className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
      >
        <Copy className="size-3.5" /> Copy transcript
      </button>

      <div dir={rtl ? "rtl" : "ltr"} className="space-y-1">
        {segments.map((segment, index) => {
          const previous = segments[index - 1];
          const startsTurn = !previous || previous.speaker !== segment.speaker;
          const active =
            currentTime >= segment.start_s && currentTime <= segment.end_s;
          return (
            <div key={segment.id}>
              {startsTurn && (
                <p className="mt-4 flex items-center gap-2 text-xs font-medium text-foreground/80">
                  {speakerLabel(segment.speaker, names) || "Speaker"}
                  <span className="tabular-nums text-muted-foreground">
                    {formatClock(segment.start_s)}
                  </span>
                </p>
              )}
              <p
                onClick={() => seek(segment.start_s)}
                className={cn(
                  "cursor-pointer rounded px-2 py-1 text-sm leading-relaxed transition",
                  active ? "bg-white/[0.07]" : "hover:bg-white/[0.03]"
                )}
              >
                {segment.text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
