import { Download } from "lucide-react";
import { Waveform } from "@/components/waveform";
import type { TtsGenerationRecord } from "@/lib/types";

/**
 * The read-only view behind a voice share link. Same player as the studio,
 * without anything that could change the record — the link goes to people
 * who don't have a login, and often past them.
 */
export function SharedVoice({
  generation,
  token,
}: {
  generation: TtsGenerationRecord;
  token: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-4">
        {!generation.output_url ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Playback isn&apos;t available for this voice-over.
          </p>
        ) : (
          <>
            <Waveform src={generation.output_url} />
            <audio src={generation.output_url} controls className="w-full" />
          </>
        )}
      </div>

      {generation.output_url && (
        // A plain link with a same-origin, attachment-disposition href — no
        // client script needed, and it downloads for someone with no login.
        <a
          href={`/api/tts/share/${token}/download`}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <Download className="size-3.5" /> Download
        </a>
      )}

      {generation.text && (
        <div dir="rtl" className="space-y-1 rounded-xl border border-white/8 p-4">
          <p className="whitespace-pre-line text-sm leading-relaxed">{generation.text}</p>
        </div>
      )}
    </div>
  );
}
