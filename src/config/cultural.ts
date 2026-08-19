/**
 * Athar — cultural accuracy for Gulf subjects.
 *
 * Image models carry a strong, wrong prior for "Emirati" or "Arab woman":
 * they reach for a South Asian or generic orientalist face, render an abaya as
 * a shapeless cloak or a chador, and wrap a shayla like a pinned hijab. Naming
 * the nationality and hoping is the failure — the model needs the garment's
 * construction and the features described, plus an explicit ban on the wrong
 * renderings it would otherwise reach for.
 *
 * This runs on EVERY generation, not just the storyboard planner, because the
 * problem is at the image model and applies wherever a prompt comes from.
 * Anything the user has already described stays untouched; this only adds.
 */

/**
 * Does this prompt involve a Gulf/Emirati subject? Deliberately narrow: it
 * fires on nationality, national dress and the region's own words, not on
 * "desert" or "mosque", which would drag the guidance into shots with no
 * people in them.
 */
const GULF_SUBJECT_RE =
  /\b(emirati|khaleeji|gulf\s+(?:arab|national|man|woman|men|women|family)|uae\s+(?:national|man|woman|men|women|family|citizen)|abaya|kandura|kandoura|dishdasha|thobe|thawb|shayla|ghutra|keffiyeh|agal|igal|jalabiya|saudi|qatari|kuwaiti|bahraini|omani|dubai\s+(?:man|woman|family)|abu\s+dhabi\s+(?:man|woman|family))\b/i;

/** Is a woman or girl in frame? Governs which garment guidance applies. */
const FEMALE_RE =
  /\b(woman|women|girl|girls|lady|ladies|female|mother|daughter|sister|wife|businesswoman|she|her)\b/i;

/** Is a man or boy in frame? */
const MALE_RE =
  /\b(man|men|boy|boys|male|father|son|brother|husband|he|his|businessman|sheikh)\b/i;

/** Are children specifically in frame? */
const CHILD_RE = /\b(child|children|kid|kids|boy|boys|girl|girls|toddler|infant)\b/i;

/** Did the user explicitly ask for a face covering? Then leave it alone. */
const EXPLICIT_COVERING_RE = /\b(niqab|burqa|burka|face\s*veil|batoula|battoula)\b/i;

/**
 * How the garments are actually constructed. Written as description a model
 * can draw, not as a label it has to look up.
 */
const WOMAN_DRESS =
  "she wears a flowing black abaya — an open or closed over-robe worn over her " +
  "own clothes, cut with real tailoring and weight so it drapes rather than " +
  "hangs shapeless, often with subtle embroidery or contrast trim — and a " +
  "shayla, a long rectangular scarf draped loosely over the head and swept " +
  "back over the shoulders, sitting away from the face and usually showing the " +
  "front of the hair";

const MAN_DRESS =
  "he wears a crisp white kandura, an ankle-length robe with a simple collar " +
  "and no lapels, worn with a ghutra headscarf (plain white, or red-and-white " +
  "checked) held in place by a black agal cord";

const BOY_DRESS =
  "the boy wears a white kandura like the men, usually without the ghutra and " +
  "agal at his age, with simple leather sandals";

const GIRL_DRESS =
  "the girl wears a modest dress or a light jalabiya, uncovered as is normal " +
  "for a child";

/** Gulf Arab features, stated because the model's default is not this. */
const FEATURES =
  "Khaleeji Gulf Arab features — not South Asian, Levantine or North African — " +
  "with contemporary grooming and modern styling";

const SETTING =
  "contemporary, high-specification Emirati setting; no orientalist or " +
  "desert-cliché staging";

/**
 * The renderings the model reaches for when it gets this wrong. These matter
 * more than the positive text: a negative prompt is the reliable lever, and
 * "abaya" alone will otherwise produce a chador about half the time.
 */
const GULF_NEGATIVES = [
  "chador",
  "tightly wrapped hijab pinned under the chin",
  "shapeless enveloping cloak",
  "sari",
  "bindi",
  "south asian features",
  "turban",
  "harem styling",
  "belly dancer",
  "orientalist costume",
  "desert nomad cliché",
  "bedouin costume drama",
  "generic middle-eastern stock photo look",
];

export type CulturalGuidance = {
  /** Appended to the positive prompt. */
  positive: string;
  /** Appended to the negative prompt. */
  negative: string;
};

/**
 * Guidance for a prompt, or null when no Gulf subject is involved.
 *
 * Only garments for people actually mentioned are added — a prompt about a man
 * should not carry a paragraph about an abaya, which would put a second person
 * in the frame.
 */
export function culturalGuidance(prompt: string): CulturalGuidance | null {
  if (!GULF_SUBJECT_RE.test(prompt)) return null;

  const female = FEMALE_RE.test(prompt);
  const male = MALE_RE.test(prompt);
  const child = CHILD_RE.test(prompt);
  // No gender named at all — a "family", or just "Emiratis". Cover both.
  const neither = !female && !male;

  const parts: string[] = [];
  if (child && female) parts.push(GIRL_DRESS);
  if (child && male) parts.push(BOY_DRESS);
  if (female && !child) parts.push(WOMAN_DRESS);
  if (male && !child) parts.push(MAN_DRESS);
  if (neither) parts.push(WOMAN_DRESS, MAN_DRESS);

  parts.push(FEATURES, SETTING);

  const negatives = [...GULF_NEGATIVES];
  // Only ban face coverings when the prompt didn't ask for one.
  if (!EXPLICIT_COVERING_RE.test(prompt)) {
    negatives.push("niqab", "face veil", "burqa");
  }

  return {
    positive: `Culturally accurate: ${parts.join("; ")}.`,
    negative: negatives.join(", "),
  };
}
