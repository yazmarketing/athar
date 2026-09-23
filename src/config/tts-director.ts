/**
 * VO Director — client-importable config. No secrets, no `process.env` reads.
 * The AI pipeline lives in lib/tts-director-ai.ts (server-only).
 *
 * Constrained taxonomies, shared by the LLM prompts and the learning-loop
 * aggregation query — free-text emotion labels ("confident" vs "assured" vs
 * "Confident") would make grouping by emotion in getLearnedDefaults()
 * meaningless, so both sides import from here.
 */

export const DIRECTOR_EMOTIONS = [
  "neutral",
  "warm",
  "confident",
  "urgent",
  "playful",
  "serious",
  "emotional",
  "authoritative",
  "intimate",
  "energetic",
  "calm",
  "dramatic",
] as const;
export type DirectorEmotion = (typeof DIRECTOR_EMOTIONS)[number];

export const DIRECTOR_PACES = ["slow", "normal", "fast"] as const;
export type DirectorPace = (typeof DIRECTOR_PACES)[number];

/** The register-strength dial's bands — below LIGHT stays close to written
 * form, above STRONG goes full colloquial Emirati. */
export const REGISTER_LIGHT = 0.3;
export const REGISTER_STRONG = 0.7;
export const DEFAULT_REGISTER_STRENGTH = 0.5;

export function registerBand(strength: number): "light" | "medium" | "strong" {
  if (strength < REGISTER_LIGHT) return "light";
  if (strength > REGISTER_STRONG) return "strong";
  return "medium";
}

/** Delivery tags shown in the UI — folded into Pass 1's direction prompt. */
export type DeliveryTag = { id: string; label: string };
export const DELIVERY_TAGS: DeliveryTag[] = [
  { id: "natural", label: "Natural" },
  { id: "warm", label: "Warm" },
  { id: "proud", label: "Proud" },
  { id: "emotional", label: "Emotional" },
  { id: "powerful", label: "Powerful" },
  { id: "conversational", label: "Conversational" },
];
export const MAX_DELIVERY_TAGS = 2;

/** Default variant-take presets — a starting point, overridable per call. */
export type TakePreset = { id: "natural" | "controlled" | "expressive"; label: string; stability: number; speed: number };
export const DEFAULT_TAKE_PRESETS: TakePreset[] = [
  { id: "natural", label: "Natural", stability: 0.4, speed: 1.0 },
  { id: "controlled", label: "Controlled", stability: 0.55, speed: 0.97 },
  { id: "expressive", label: "Expressive", stability: 0.25, speed: 1.02 },
];

/** Minimum selection-event sample size before the learning loop trusts an average. */
export const LEARNING_MIN_SAMPLE = 3;
