/**
 * Text-to-speech (Munsit) — client-importable config. No secrets, no
 * `process.env` reads, so the Voice page can import this on the client. The
 * actual API key lives in lib/munsit-tts.ts.
 */

export const DEFAULT_STABILITY = 0.5;
export const DEFAULT_SPEED = 1.0;
export const DEFAULT_SAMPLE_RATE = 24000;
export const MIN_SPEED = 0.7;
export const MAX_SPEED = 1.2;

export type TtsPreset = {
  id: string;
  label: string;
  /** One line explaining the delivery this dials in — shown under the label. */
  description: string;
  icon: "clapperboard" | "megaphone" | "message-circle" | "headphones" | "briefcase" | "book-open";
  stability: number;
  speed: number;
};

/**
 * Voice-character shortcuts for Stability + Speed. Most people have no
 * intuition for what "stability 0.6" sounds like, so these are the same
 * tuned combinations as before, named for the delivery they produce instead
 * of a use case — and unlike the old version, picking one only sets the two
 * sliders. It never touches what you've typed; almost nobody actually wants
 * the sample script overwriting their own text.
 */
export const TTS_PRESETS: TtsPreset[] = [
  {
    id: "punchy-upbeat",
    label: "Punchy & Upbeat",
    description: "Energetic delivery with a quick pace — ads, promos",
    icon: "megaphone",
    stability: 0.6,
    speed: 1.05,
  },
  {
    id: "clear-even",
    label: "Clear & Even",
    description: "Consistent, easy to follow — explainers, walkthroughs",
    icon: "briefcase",
    stability: 0.55,
    speed: 1.0,
  },
  {
    id: "fast-casual",
    label: "Fast & Casual",
    description: "Quick and informal — social, scroll-stopping hooks",
    icon: "message-circle",
    stability: 0.45,
    speed: 1.1,
  },
  {
    id: "calm-steady",
    label: "Calm & Steady",
    description: "Slower and composed — on-hold, IVR, instructions",
    icon: "headphones",
    stability: 0.7,
    speed: 0.95,
  },
  {
    id: "slow-weighty",
    label: "Slow & Weighty",
    description: "Deliberate and grave — documentary narration",
    icon: "clapperboard",
    stability: 0.65,
    speed: 0.92,
  },
  {
    id: "warm-natural",
    label: "Warm & Natural",
    description: "Relaxed, conversational pace — storytelling",
    icon: "book-open",
    stability: 0.5,
    speed: 1.0,
  },
];

/** Filter option labels for the Voice Library — matches Munsit's own picker. */
export const VOICE_AGE_OPTIONS = ["young", "middle", "elderly"] as const;
export const VOICE_GENDER_OPTIONS = ["male", "female"] as const;

/**
 * Flag + display label for a language or dialect code. Voices come back
 * from the API with whatever codes the provider uses, so this is a
 * best-effort lookup with a graceful fallback for anything unrecognized —
 * not an exhaustive enum.
 */
export type LocaleMeta = { flag: string; label: string };

const LANGUAGE_META: Record<string, LocaleMeta> = {
  ar: { flag: "🇸🇦", label: "Arabic" },
  en: { flag: "🇺🇸", label: "English" },
  fr: { flag: "🇫🇷", label: "French" },
  es: { flag: "🇪🇸", label: "Spanish" },
  hi: { flag: "🇮🇳", label: "Hindi" },
  ur: { flag: "🇵🇰", label: "Urdu" },
  tr: { flag: "🇹🇷", label: "Turkish" },
};

const DIALECT_META: Record<string, LocaleMeta> = {
  auto: { flag: "🌐", label: "Auto-detect" },
  fusha: { flag: "🌐", label: "MSA (Fus'ha)" },
  msa: { flag: "🌐", label: "MSA (Fus'ha)" },
  emirati: { flag: "🇦🇪", label: "Emirati" },
  najdi: { flag: "🇸🇦", label: "Saudi" },
  saudi: { flag: "🇸🇦", label: "Saudi" },
  hijazi: { flag: "🇸🇦", label: "Hijazi" },
  kuwaiti: { flag: "🇰🇼", label: "Kuwaiti" },
  qatari: { flag: "🇶🇦", label: "Qatari" },
  omani: { flag: "🇴🇲", label: "Omani" },
  bahraini: { flag: "🇧🇭", label: "Bahraini" },
  egyptian: { flag: "🇪🇬", label: "Egyptian" },
  levantine: { flag: "🇯🇴", label: "Levantine" },
  jordanian: { flag: "🇯🇴", label: "Jordanian" },
  lebanese: { flag: "🇱🇧", label: "Lebanese" },
  syrian: { flag: "🇸🇾", label: "Syrian" },
  iraqi: { flag: "🇮🇶", label: "Iraqi" },
  sudanese: { flag: "🇸🇩", label: "Sudanese" },
  american: { flag: "🇺🇸", label: "American English" },
  british: { flag: "🇬🇧", label: "British English" },
  australian: { flag: "🇦🇺", label: "Australian English" },
  indian: { flag: "🇮🇳", label: "Indian English" },
};

const AGE_META: Record<string, LocaleMeta> = {
  young: { flag: "🧑", label: "Young" },
  middle: { flag: "🧔", label: "Middle" },
  elderly: { flag: "🧓", label: "Elderly" },
};

function metaFor(table: Record<string, LocaleMeta>, code: string): LocaleMeta {
  const known = table[code.toLowerCase().trim()];
  if (known) return known;
  return { flag: "🗣️", label: code.charAt(0).toUpperCase() + code.slice(1) };
}

export const languageMeta = (code: string): LocaleMeta => metaFor(LANGUAGE_META, code);
export const dialectMeta = (code: string): LocaleMeta => metaFor(DIALECT_META, code);
export const ageMeta = (code: string): LocaleMeta => metaFor(AGE_META, code);
