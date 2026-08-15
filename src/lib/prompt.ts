import type { PromptInputs } from "@/lib/types";
import { resolveStyle } from "@/config/styles";
import { resolveCamera } from "@/config/camera";

/**
 * Structured prompt builder (§5.3).
 *
 * FINAL_PROMPT = SUBJECT · ACTION · PRESET.camera_fragment · LIGHTING
 *              · BRAND_TOKENS · STYLE.positive
 * NEGATIVE_PROMPT = GLOBAL bans + STYLE.negative + BRAND bans
 *
 * The look is chosen per-generation via a style preset (see config/styles.ts)
 * instead of a single hardcoded quality suffix.
 */

const GLOBAL_NEGATIVE =
  "watermark, text overlay, logo, low quality, blurry, distorted anatomy, oversaturated";

export function buildPrompt(inputs: PromptInputs): {
  finalPrompt: string;
  negativePrompt: string;
} {
  // A custom per-client preset (styleTokens) overrides the built-in styleId.
  const style = resolveStyle(inputs.styleId);
  const stylePositive = inputs.styleTokens?.trim() || style.positive.trim();
  const styleNegative =
    inputs.styleTokens?.trim() != null && inputs.styleTokens?.trim() !== ""
      ? inputs.styleNegative?.trim()
      : style.negative?.trim();
  const camera = resolveCamera(inputs.cameraId);

  const parts = [
    inputs.subject.trim(),
    inputs.action?.trim(),
    inputs.presetFragment?.trim(),
    inputs.lighting?.trim(),
    inputs.brandTokens?.trim(),
    camera.fragment.trim() || undefined,
    stylePositive || undefined,
  ].filter((p): p is string => Boolean(p));

  const negativeParts = [
    GLOBAL_NEGATIVE,
    styleNegative,
    inputs.negativeAdditions?.trim(),
  ].filter((p): p is string => Boolean(p));

  return {
    finalPrompt: parts.join(", "),
    negativePrompt: negativeParts.join(", "),
  };
}
