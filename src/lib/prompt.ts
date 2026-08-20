import type { PromptInputs } from "@/lib/types";
import { resolveStyle } from "@/config/styles";
import { resolveCamera } from "@/config/camera";
import { culturalGuidance } from "@/config/cultural";
import { expandMentions } from "@/lib/mentions";

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

/**
 * Applied to every generation. Split because two of these actively fight the
 * user: banning "logo" and "text overlay" while the prompt asks for a logo or
 * lettering pulls the model both ways at once, and it resolves that by
 * rendering a degraded, misspelled approximation.
 */
const BASE_NEGATIVE =
  "low quality, blurry, distorted anatomy, oversaturated";

/** Only safe to apply when the prompt is NOT asking for text or a logo. */
const NO_TEXT_NEGATIVE = "watermark, text overlay, logo";

/**
 * Does the prompt deliberately want lettering? Covers logos, wordmarks,
 * signage, and any quoted string (`the sign reads "OPEN"`).
 */
function wantsText(prompt: string): boolean {
  return /\b(logo|wordmark|lettering|typograph|text|signage|sign|label|banner|billboard|branding|written|reads|says|caption|title|slogan|nameplate|engrav)/i.test(
    prompt
  ) || /["“”'']\s*\S/.test(prompt);
}

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

  /**
   * `@image2` in the prompt becomes an explicit, indexed instruction before
   * anything else runs — so the rest of the pipeline (cultural guidance, the
   * text/logo check) sees the real sentence rather than a token.
   */
  const subject = expandMentions(
    inputs.subject.trim(),
    (inputs.referenceLabels ?? []).map((label) => ({ label }))
  );

  const parts = [
    subject,
    inputs.action?.trim(),
    inputs.presetFragment?.trim(),
    inputs.lighting?.trim(),
    inputs.brandTokens?.trim(),
    camera.fragment.trim() || undefined,
    stylePositive || undefined,
  ].filter((p): p is string => Boolean(p));

  // Decide against everything the user actually wrote, not just the subject.
  const positiveText = parts.join(" ");

  /**
   * Gulf subjects get the garment construction and the features spelled out,
   * plus a ban on the renderings the model would otherwise reach for. Applied
   * here rather than in any one caller so every path benefits — the dock, the
   * assistant, storyboards and campaigns alike.
   */
  const cultural = culturalGuidance(positiveText);

  const negativeParts = [
    BASE_NEGATIVE,
    wantsText(positiveText) ? undefined : NO_TEXT_NEGATIVE,
    styleNegative,
    cultural?.negative,
    inputs.negativeAdditions?.trim(),
  ].filter((p): p is string => Boolean(p));

  return {
    finalPrompt: [...parts, cultural?.positive].filter(Boolean).join(", "),
    negativePrompt: negativeParts.join(", "),
  };
}
