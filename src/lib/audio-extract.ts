"use client";

import {
  CHUNK_SECONDS,
  SAMPLE_RATE,
  encodeWav,
  planChunks,
  type ChunkPlan,
} from "@/lib/audio-chunks";

/**
 * Pull the audio out of a video, in the browser, before anything is uploaded.
 *
 * This is what makes a hosted transcription API workable for video at all.
 * OpenAI accepts 25MB; a three-minute export is already past that and is
 * mostly picture. Decoding here turns a 500MB file into a few megabytes of
 * 16kHz mono audio — under the limit, faster to upload, and cheaper to keep.
 *
 * The decode runs in an OfflineAudioContext, which resamples as fast as the
 * machine allows rather than in real time, so a long video takes seconds
 * rather than playing out in real time.
 */

export class UnsupportedMediaError extends Error {}

/**
 * Re-read media we already stored, for a re-run.
 *
 * The browser is where the audio gets decoded, and by the time someone presses
 * Retry the original file is long gone — so it comes back from the Space.
 * Needs a CORS rule allowing GET from this origin.
 */
export async function fetchStoredMedia(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new UnsupportedMediaError(
      `Could not re-read the stored media (${res.status})`
    );
  }
  return res.blob();
}

export type ExtractedChunk = ChunkPlan & { wav: ArrayBuffer };

export type ExtractedAudio = {
  durationS: number;
  chunks: ExtractedChunk[];
};

/**
 * Decode `file` to 16kHz mono and slice it into upload-sized WAV chunks.
 *
 * Throws `UnsupportedMediaError` when the browser cannot decode the container
 * — ProRes and MKV are the usual culprits — so the caller can say something
 * more useful than "failed".
 */
export async function extractAudioChunks(
  file: File | Blob,
  onProgress?: (fraction: number) => void
): Promise<ExtractedAudio> {
  const bytes = await file.arrayBuffer();
  onProgress?.(0.15);

  const name = file instanceof File ? file.name : "this file";
  const mono = await decodeToMono(bytes, name);
  onProgress?.(0.7);

  const durationS = mono.length / SAMPLE_RATE;
  const plans = planChunks(durationS, CHUNK_SECONDS);
  const chunks = plans.map((plan) => ({
    ...plan,
    wav: encodeWav(
      mono.subarray(
        Math.floor(plan.startS * SAMPLE_RATE),
        Math.floor(plan.endS * SAMPLE_RATE)
      )
    ),
  }));
  onProgress?.(1);

  return { durationS, chunks };
}

async function decodeToMono(bytes: ArrayBuffer, filename: string): Promise<Float32Array> {
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) {
    throw new UnsupportedMediaError("This browser cannot decode audio");
  }

  const context = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(bytes);
  } catch {
    throw new UnsupportedMediaError(
      `Could not read the audio in ${filename}. Export it as MP4 or MP3 and try again — ProRes and MKV cannot be decoded in a browser.`
    );
  } finally {
    void context.close();
  }

  if (decoded.length === 0) {
    throw new UnsupportedMediaError("There is no audio track in that file");
  }

  // Resample to 16kHz mono in one pass. Whisper listens at 16kHz mono, so
  // anything more is bytes we would pay to upload and it would discard.
  const frames = Math.max(
    1,
    Math.ceil((decoded.length / decoded.sampleRate) * SAMPLE_RATE)
  );
  const offline = new OfflineAudioContext(1, frames, SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}
