/**
 * Context-sensitive cultural direction. A country or garment is a cue to
 * respect the brief, never permission to invent a face, costume or setting.
 */
const COUNTRIES = [
  { name: "United Arab Emirates", pattern: /\b(emirati(?:s)?|uae|united arab emirates|dubai|abu dhabi)\b|الإمارات|إماراتي|اماراتي|دبي|أبوظبي|أبو ظبي/i },
  { name: "Saudi Arabia", pattern: /\b(saudi(?:s)?|saudi arabia|riyadh|jeddah)\b|السعودية|سعودي|الرياض|جدة/i },
  { name: "Qatar", pattern: /\b(qatar|qatari(?:s)?|doha)\b|قطر|قطري|الدوحة/i },
  { name: "Kuwait", pattern: /\b(kuwait|kuwaiti(?:s)?)\b|الكويت|كويتي/i },
  { name: "Bahrain", pattern: /\b(bahrain|bahraini(?:s)?|manama)\b|البحرين|بحريني|المنامة/i },
  { name: "Oman", pattern: /\b(oman|omani(?:s)?|muscat)\b|عُمان|عماني|مسقط/i },
] as const;

const REGIONAL_RE = /\b(khaleeji|gulf\s+(?:arab|national|man|woman|men|women|family|culture))\b|خليجي|خليجية/i;
const GARMENT_RE = /\b(abaya|kandura|kandoura|dishdasha|thobe|thawb|shayla|ghutra|keffiyeh|agal|igal|jalabiya|niqab|batoula|battoula)\b|عباية|عباءة|كندورة|دشداشة|ثوب|شيلة|غترة|عقال|نقاب/i;

export type CulturalGuidance = { positive: string; negative: string };

export function culturalGuidance(prompt: string): CulturalGuidance | null {
  const countries = COUNTRIES.filter(({ pattern }) => pattern.test(prompt));
  const regional = REGIONAL_RE.test(prompt);
  const garment = GARMENT_RE.test(prompt);
  if (!countries.length && !regional && !garment) return null;

  const context = countries.length
    ? `The brief mentions ${countries.map(({ name }) => name).join(" and ")}. Apply each country's cultural details only to the subjects or locations it describes; keep regional traditions distinct.`
    : regional
      ? "The brief gives a Gulf context without a specific country. Keep unspecified national details open rather than selecting one country's dress or architecture."
      : "A garment name alone does not establish a person's nationality or the scene's location.";

  return {
    positive: [
      "Culturally accurate:",
      context,
      "Preserve the requested place, era, clothing, headwear, face coverings, age, cast and creative style, including contemporary, historical or imagined settings.",
      "Follow supplied visual references for specific people and garments. When traditional clothing is requested, respect the named garment's construction and the specified local context without adding unrequested garments or people.",
      "Nationality does not prescribe a face, skin tone or body type. Leave unspecified personal features and wardrobe diverse and natural for the activity.",
    ].join(" "),
    // No automatic wardrobe or ethnic exclusions: they can contradict a brief.
    negative: "",
  };
}
