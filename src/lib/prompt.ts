import type { PromptInputs } from "@/lib/types";

/**
 * Structured prompt builder (§5.3).
 *
 * FINAL_PROMPT = SUBJECT · ACTION · PRESET.camera_fragment · LIGHTING
 *              · BRAND_TOKENS · QUALITY_TOKENS
 * NEGATIVE_PROMPT = GLOBAL bans + BRAND bans + preset-specific bans
 */

const QUALITY_TOKENS =
  "photorealistic, 4k, film grain, sharp focus, professional photography";

const GLOBAL_NEGATIVE =
  "watermark, text overlay, logo, low quality, blurry, distorted anatomy, oversaturated";

export function buildPrompt(inputs: PromptInputs): {
  finalPrompt: string;
  negativePrompt: string;
} {
  const parts = [
    inputs.subject.trim(),
    inputs.action?.trim(),
    inputs.presetFragment?.trim(),
    inputs.lighting?.trim(),
    inputs.brandTokens?.trim(),
    QUALITY_TOKENS,
  ].filter((p): p is string => Boolean(p));

  const negativeParts = [GLOBAL_NEGATIVE, inputs.negativeAdditions?.trim()].filter(
    (p): p is string => Boolean(p)
  );

  return {
    finalPrompt: parts.join(", "),
    negativePrompt: negativeParts.join(", "),
  };
}
