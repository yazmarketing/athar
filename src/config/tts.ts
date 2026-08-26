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
  /** One line explaining what picking this actually does — shown under the label. */
  description: string;
  icon: "clapperboard" | "megaphone" | "message-circle" | "headphones" | "briefcase" | "book-open";
  text: string;
  stability: number;
  speed: number;
};

/**
 * "Get started with" quick-fill chips — reworked from Munsit's generic demo
 * chips into the production use cases this app actually gets used for. Each
 * one fills the first speaker with sample copy and sets stability/speed to
 * what that kind of read actually sounds like, so the preset is a starting
 * point to edit, not just a demo.
 */
export const TTS_PRESETS: TtsPreset[] = [
  {
    id: "ad-vo",
    label: "Ad voice-over",
    description: "Punchy and upbeat, fills in a sample offer script",
    icon: "megaphone",
    text: "عرض لفترة محدودة! احصل على خصم ٣٠٪ على جميع المنتجات هذا الأسبوع فقط. لا تفوت الفرصة، تسوق الآن.",
    stability: 0.6,
    speed: 1.05,
  },
  {
    id: "product-explainer",
    label: "Product explainer",
    description: "Clear and even, fills in a sample feature pitch",
    icon: "briefcase",
    text: "تطبيقنا الجديد يساعدك على إدارة أعمالك بسهولة أكبر، من متابعة الطلبات إلى تحليل الأداء، كل ذلك في مكان واحد.",
    stability: 0.55,
    speed: 1.0,
  },
  {
    id: "social-reel",
    label: "Social reel VO",
    description: "Fast and casual, fills in a scroll-stopping hook",
    icon: "message-circle",
    text: "وقفة بسيطة قبل ما تكمل سكرول... شوف كيف غيرنا يومنا بخطوة وحدة بس.",
    stability: 0.45,
    speed: 1.1,
  },
  {
    id: "ivr",
    label: "On-hold / IVR",
    description: "Calm and steady, fills in a sample hold message",
    icon: "headphones",
    text: "شكراً لاتصالكم بنا. جميع ممثلي خدمة العملاء مشغولون حالياً، الرجاء الانتظار وسيتم الرد عليكم في أقرب وقت ممكن.",
    stability: 0.7,
    speed: 0.95,
  },
  {
    id: "documentary",
    label: "Documentary",
    description: "Slow and weighty, fills in a sample narration line",
    icon: "clapperboard",
    text: "في قلب الصحراء، حيث تلتقي الرمال بالسماء، تروي هذه الأرض قصة آلاف السنين من الحضارة والتغيير.",
    stability: 0.65,
    speed: 0.92,
  },
  {
    id: "story",
    label: "Reading a story",
    description: "Warm and natural, fills in a sample story opening",
    icon: "book-open",
    text: "في يوم من الأيام، عاش في قرية صغيرة صياد بسيط يحلم بمغامرة تغير حياته إلى الأبد.",
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
