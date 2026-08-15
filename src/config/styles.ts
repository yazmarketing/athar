/**
 * Athar — Style presets.
 *
 * Replaces the old hardcoded `QUALITY_TOKENS` suffix that forced a photographic,
 * film-grain look onto *every* image. Instead the user picks a curated look
 * (Higgsfield / Magnific style), and each preset contributes its own positive
 * and negative prompt fragments. "Raw" adds nothing — the prompt and brand kit
 * fully control the result.
 */

export type StylePreset = {
  id: string;
  label: string;
  /** One-line "when to use this" shown under the label in the picker. */
  description: string;
  /** Appended to the positive prompt. Empty string = nothing added. */
  positive: string;
  /** Appended to the negative prompt (things this look should avoid). */
  negative?: string;
};

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "photographic",
    label: "Photographic",
    description: "Clean, realistic photography — people, lifestyle, product.",
    positive:
      "professional photography, photorealistic, sharp focus, natural lighting, high detail",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    description: "Moody, colour-graded, film-like. Campaign hero shots.",
    positive:
      "cinematic film still, shallow depth of field, dramatic directional lighting, colour graded, subtle 35mm film grain, anamorphic",
  },
  {
    id: "studio_product",
    label: "Studio product",
    description: "E-commerce packshot — clean background, no grain.",
    positive:
      "studio product photography, softbox lighting, seamless clean background, crisp reflections, ultra sharp, high detail",
  },
  {
    id: "editorial",
    label: "Editorial",
    description: "High-end fashion / magazine look.",
    positive:
      "editorial fashion photography, high-end retouching, soft directional light, magazine quality, refined colour",
  },
  {
    id: "illustration",
    label: "Illustration",
    description: "Drawn / illustrated, not a photo.",
    positive:
      "digital illustration, clean linework, stylised shapes, vibrant, flat shading, high detail",
    negative: "photorealistic, photograph, film grain",
  },
  {
    id: "render_3d",
    label: "3D render",
    description: "CGI / product visualisation.",
    positive:
      "3D render, physically based materials, soft global illumination, studio lighting, high detail",
    negative: "film grain",
  },
  {
    id: "graphic",
    label: "Flat graphic",
    description: "Logos, posters, social graphics.",
    positive:
      "flat vector graphic, bold minimal shapes, high contrast, clean poster design",
    negative: "photorealistic, photograph, 3d render, film grain",
  },
  {
    id: "raw",
    label: "Raw (no look)",
    description: "Add nothing — prompt & brand kit control the style.",
    positive: "",
  },
];

export const DEFAULT_STYLE_ID = "photographic";

export function resolveStyle(id?: string | null): StylePreset {
  return (
    STYLE_PRESETS.find((s) => s.id === id) ??
    STYLE_PRESETS.find((s) => s.id === DEFAULT_STYLE_ID)!
  );
}
