import type { SceneCraft } from "./advanced";
/** Deterministic stereo PCM: cue-based score, no external media or voice impersonation. */
export function synthesizeSoundtrack(duration: number, score: NonNullable<SceneCraft["soundtrack"]>) {
  const rate = 48000, frames = Math.ceil(duration * rate), channels = [new Float32Array(frames), new Float32Array(frames)];
  let seed = 73421;
  const noise = () => { seed = (Math.imul(seed,1664525) + 1013904223) | 0; return (seed >>> 0) / 2147483648 - 1; };
  for (const cue of score.cues) {
    const length = Math.round(cue.duration * rate), start = Math.round(cue.time * rate);
    const left = Math.cos((cue.pan + 1) * Math.PI / 4), right = Math.sin((cue.pan + 1) * Math.PI / 4);
    let phase = 0, filtered = 0;
    for (let i = 0; i < length && start + i < frames; i++) {
      const t = i / rate, progress = i / length;
      const fade = Math.min(1,t / 0.015) * Math.min(1,(cue.duration - t) / 0.06);
      const freq = cue.type === "rise" ? cue.frequency * (0.5 + 2 * progress * progress) : cue.type === "impact" ? cue.frequency * (1 + 1.5 * Math.exp(-t * 20)) : cue.frequency;
      phase += 2 * Math.PI * freq / rate;
      filtered += 0.12 * (noise() - filtered);
      let sample: number;
      if (cue.type === "air") sample = filtered * 2.5 * Math.sin(Math.PI * progress) ** 2;
      else if (cue.type === "impact") sample = Math.sin(phase) * Math.exp(-t * 5) + filtered * 0.4 * Math.exp(-t * 16);
      else if (cue.type === "rise") sample = (Math.sin(phase) * 0.3 + filtered) * progress ** 1.4;
      else sample = (Math.sin(phase) + 0.15 * Math.sin(phase * 2.002)) * Math.sin(Math.PI * progress) ** 0.5;
      sample *= cue.gain * score.gain * fade * 0.6;
      channels[0][start+i] += sample * left; channels[1][start+i] += sample * right;
    }
  }
  let peak = 0; for (let i=0;i<frames;i++) peak = Math.max(peak,Math.abs(channels[0][i]),Math.abs(channels[1][i]));
  const attenuation = Math.min(1,0.88 / Math.max(peak,0.001));
  const out = Buffer.alloc(44 + frames * 4);
  out.write("RIFF",0);out.writeUInt32LE(out.length-8,4);out.write("WAVEfmt ",8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(2,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*4,28);out.writeUInt16LE(4,32);out.writeUInt16LE(16,34);out.write("data",36);out.writeUInt32LE(frames*4,40);
  for(let i=0;i<frames;i++)for(let c=0;c<2;c++)out.writeInt16LE(Math.round(channels[c][i]*attenuation*32767),44+i*4+c*2);
  return out;
}
