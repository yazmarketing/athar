/**
 * Center-crop pixel size so a still matches a target aspect (e.g. 21:9 → 16:9).
 *
 * Seedance first-frame clips inherit the still's ratio and reject a separate
 * `ratio` field, so the image itself has to be the output frame.
 */

export function parseAspect(
  ratio: string
): { w: number; h: number } | null {
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  return { w, h };
}

export function needsAspectCrop(
  srcW: number,
  srcH: number,
  aspectW: number,
  aspectH: number,
  epsilon = 0.02
): boolean {
  if (srcW < 2 || srcH < 2) return false;
  const src = srcW / srcH;
  const dst = aspectW / aspectH;
  return Math.abs(src - dst) / dst > epsilon;
}

function evenSize(
  srcW: number,
  srcH: number,
  width: number,
  height: number
): { width: number; height: number } | null {
  width = Math.max(2, width - (width % 2));
  height = Math.max(2, height - (height % 2));
  if (width > srcW) width = srcW - (srcW % 2);
  if (height > srcH) height = srcH - (srcH % 2);
  if (width < 2 || height < 2) return null;
  if (width === srcW && height === srcH) return null;
  return { width, height };
}

/** Pixel crop that keeps the source's shorter side. Even edges for ffmpeg. */
export function centerCropForAspect(
  srcW: number,
  srcH: number,
  aspectW: number,
  aspectH: number
): { width: number; height: number } | null {
  if (!needsAspectCrop(srcW, srcH, aspectW, aspectH)) return null;
  const dstAR = aspectW / aspectH;
  const srcAR = srcW / srcH;
  let width: number;
  let height: number;
  if (srcAR > dstAR) {
    height = srcH;
    width = Math.round(srcH * dstAR);
  } else {
    width = srcW;
    height = Math.round(srcW / dstAR);
  }
  return evenSize(srcW, srcH, width, height);
}

/**
 * Seedance (and CreateAsset) reject stills outside ~0.39–2.50. Trim the
 * smallest strip that lands inside [minAR, maxAR].
 */
export function centerCropToAspectRange(
  srcW: number,
  srcH: number,
  minAR: number,
  maxAR: number
): { width: number; height: number } | null {
  if (srcW < 2 || srcH < 2 || minAR <= 0 || maxAR < minAR) return null;
  const ar = srcW / srcH;
  if (ar >= minAR && ar <= maxAR) return null;
  if (ar > maxAR) {
    return evenSize(srcW, srcH, Math.round(srcH * maxAR), srcH);
  }
  return evenSize(srcW, srcH, srcW, Math.round(srcW / minAR));
}

/** JPEG / PNG pixel size from the file header — no ffmpeg needed. */
export function readRasterSize(
  bytes: ArrayBuffer | Uint8Array
): { width: number; height: number } | null {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (width > 0 && height > 0) return { width, height };
  }
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 8 < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      const len = (buf[i + 2] << 8) | buf[i + 3];
      // SOF0 / SOF1 / SOF2
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = (buf[i + 5] << 8) | buf[i + 6];
        const width = (buf[i + 7] << 8) | buf[i + 8];
        if (width > 0 && height > 0) return { width, height };
        return null;
      }
      if (len < 2) break;
      i += 2 + len;
    }
  }
  return null;
}
