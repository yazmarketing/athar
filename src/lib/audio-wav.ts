/**
 * Minimal PCM WAV read/write/concat.
 *
 * Munsit synthesizes one voice per request, so a multi-speaker generation
 * (Athar's own addition — Munsit's API has no multi-voice call) makes one
 * request per speaker block and stitches the results here. Pure and
 * network-free on purpose, so it is unit-testable without a live API key.
 */

export type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** Raw PCM samples, no header. */
  data: Buffer;
};

/** Parse a canonical little-endian PCM WAV file. */
export function parseWav(buffer: Buffer): WavInfo {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("Not a WAV file");
  }
  if (buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Not a WAV file");
  }

  let offset = 12;
  let fmt: {
    channels: number;
    sampleRate: number;
    bitsPerSample: number;
  } | null = null;
  let data: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (chunkId === "fmt ") {
      fmt = {
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
    } else if (chunkId === "data") {
      data = buffer.subarray(body, Math.min(body + chunkSize, buffer.length));
    }

    // Chunks are word-aligned — an odd size pads one byte.
    offset = body + chunkSize + (chunkSize % 2);
  }

  if (!fmt || !data) throw new Error("Malformed WAV — missing fmt or data chunk");
  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitsPerSample: fmt.bitsPerSample,
    data,
  };
}

/** Write a canonical 44-byte-header PCM WAV file. */
export function buildWav(info: WavInfo): Buffer {
  const { sampleRate, channels, bitsPerSample, data } = info;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

/** `ms` of silent PCM at the given format. */
export function silence(ms: number, format: Omit<WavInfo, "data">): Buffer {
  const bytesPerSample = format.bitsPerSample / 8;
  const samples = Math.round((ms / 1000) * format.sampleRate);
  return Buffer.alloc(samples * format.channels * bytesPerSample);
}

/**
 * Concatenate WAV buffers, inserting `gapsMs[i]` milliseconds of silence
 * before buffer `i` (0 for no gap — index 0's gap is always ignored, there is
 * nothing before the first clip).
 *
 * Every input must share sample rate, channel count, and bit depth — Athar
 * always requests the same `sample_rate` for every segment in one generation,
 * so this is a validation of that invariant, not a resampling step.
 */
export function concatWav(buffers: Buffer[], gapsMs: number[] = []): Buffer {
  if (buffers.length === 0) throw new Error("Nothing to concatenate");
  const parsed = buffers.map(parseWav);
  const format = parsed[0];
  for (const clip of parsed.slice(1)) {
    if (
      clip.sampleRate !== format.sampleRate ||
      clip.channels !== format.channels ||
      clip.bitsPerSample !== format.bitsPerSample
    ) {
      throw new Error(
        `WAV format mismatch — expected ${format.sampleRate}Hz/${format.channels}ch/${format.bitsPerSample}bit, got ${clip.sampleRate}Hz/${clip.channels}ch/${clip.bitsPerSample}bit`
      );
    }
  }

  const parts: Buffer[] = [];
  parsed.forEach((clip, i) => {
    const gap = gapsMs[i];
    if (i > 0 && gap) parts.push(silence(gap, format));
    parts.push(clip.data);
  });

  return buildWav({ ...format, data: Buffer.concat(parts) });
}

/** Seconds of audio in a WAV buffer, from its PCM byte length. */
export function wavDurationSeconds(buffer: Buffer): number {
  const info = parseWav(buffer);
  const bytesPerSample = info.bitsPerSample / 8;
  const frames = info.data.length / (bytesPerSample * info.channels);
  return frames / info.sampleRate;
}
