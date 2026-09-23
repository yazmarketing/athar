import type { PromptInputs } from "@/lib/types";

/** All still adapters use instruction text; none has a separate negative channel. */
export function compileImageInstructions(prompt: string, negativePrompt?: string): string {
  const avoid = negativePrompt?.trim();
  return avoid ? `${prompt.trim()}\n\nConstraints — avoid the following:\n${avoid}` : prompt.trim();
}

/** The current image is the baseline, not a request to repeat earlier edits. */
export function imageEditPrompt(instruction: string, base: PromptInputs, extraReferences = false): PromptInputs {
  return {
    subject: [
      "Edit reference image 1. It is the baseline image.",
      `Requested change:\n${instruction.trim()}`,
      "Preserve everything outside the requested change: the person's identity, facial features, product geometry, labels, composition, wardrobe, pose, lighting and background.",
      "Change identity only when the requested change explicitly asks for a different person or identity. An age, expression, lighting or styling adjustment must preserve the same person unless explicitly requested otherwise.",
      extraReferences ? "Additional reference images guide only the elements explicitly requested. Do not replace the baseline composition or identity just because another reference is attached." : "",
    ].filter(Boolean).join("\n\n"),
    styleId: "raw",
    brandTokens: base.brandTokens,
    negativeAdditions: base.negativeAdditions,
  };
}
