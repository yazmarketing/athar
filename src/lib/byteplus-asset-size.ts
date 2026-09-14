/** BytePlus CreateAsset: width/height 300–6000, aspect 0.4–2.5. Stay inside. */
export const ASSET_MIN_EDGE = 300;
export const ASSET_MAX_EDGE = 4096;
export const ASSET_MIN_AR = 0.4;
export const ASSET_MAX_AR = 2.5;

export function fitAssetSize(width: number, height: number): {
  width: number;
  height: number;
} {
  let w = Math.max(1, width);
  let h = Math.max(1, height);
  const down = Math.min(1, ASSET_MAX_EDGE / w, ASSET_MAX_EDGE / h);
  w = Math.max(1, Math.round(w * down));
  h = Math.max(1, Math.round(h * down));
  const up = Math.max(1, ASSET_MIN_EDGE / w, ASSET_MIN_EDGE / h);
  w = Math.max(1, Math.round(w * up));
  h = Math.max(1, Math.round(h * up));
  if (w > ASSET_MAX_EDGE || h > ASSET_MAX_EDGE) {
    const clamp = Math.min(ASSET_MAX_EDGE / w, ASSET_MAX_EDGE / h);
    w = Math.max(ASSET_MIN_EDGE, Math.round(w * clamp));
    h = Math.max(ASSET_MIN_EDGE, Math.round(h * clamp));
  }
  const ar = w / h;
  if (ar < ASSET_MIN_AR) h = Math.max(ASSET_MIN_EDGE, Math.round(w / ASSET_MIN_AR));
  else if (ar > ASSET_MAX_AR) w = Math.max(ASSET_MIN_EDGE, Math.round(h * ASSET_MAX_AR));
  return { width: w, height: h };
}
