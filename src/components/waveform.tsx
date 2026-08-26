"use client";

import { useEffect, useRef } from "react";

type Props = { src: string; className?: string };

/**
 * A static amplitude-bar waveform, decoded client-side via Web Audio — no
 * charting library, just `decodeAudioData` and a canvas. Athar's own
 * addition; Munsit's own player has no visual waveform.
 */
export function Waveform({ src, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();

    fetch(src)
      .then((res) => res.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((audioBuffer) => {
        if (cancelled) return;
        draw(canvas, audioBuffer);
      })
      .catch(() => {
        // A waveform is a nicety — a fetch/decode failure just leaves it blank.
      })
      .finally(() => {
        void ctx.close();
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={64}
      className={className ?? "h-16 w-full rounded-md"}
    />
  );
}

function draw(canvas: HTMLCanvasElement, audioBuffer: AudioBuffer) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const data = audioBuffer.getChannelData(0);
  const bars = Math.min(200, Math.floor(width / 3));
  const step = Math.floor(data.length / bars);
  const mid = height / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(212, 175, 55, 0.7)"; // gold, matches the app's accent

  for (let i = 0; i < bars; i++) {
    let peak = 0;
    for (let j = 0; j < step; j++) {
      const sample = Math.abs(data[i * step + j] ?? 0);
      if (sample > peak) peak = sample;
    }
    const barHeight = Math.max(2, peak * height);
    const x = (i / bars) * width;
    ctx.fillRect(x, mid - barHeight / 2, Math.max(1, width / bars - 1), barHeight);
  }
}
