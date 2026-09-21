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
  width = Math.max(2, width - (width % 2));
  height = Math.max(2, height - (height % 2));
  if (width > srcW) width = srcW - (srcW % 2);
  if (height > srcH) height = srcH - (srcH % 2);
  if (width < 2 || height < 2) return null;
  if (width === srcW && height === srcH) return null;
  return { width, height };
}
