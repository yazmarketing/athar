/**
 * Athar — Seedance director presets (video).
 *
 * Higgsfield Cinema Studio 4.0 is a UI on top of Seedance, not a BytePlus
 * model. These pickers write the same shot language BytePlus told us Seedance
 * 2.0 / 2.5 actually follows: subject + action + shot size + camera + light +
 * grade + constraints. "Raw" adds nothing.
 */

export type DirectorPreset = {
  id: string;
  label: string;
  description: string;
  /** Appended to the positive prompt. Empty = skip. */
  fragment: string;
  /** Extra negative terms for this choice. */
  negative?: string;
};

const RAW: DirectorPreset = {
  id: "raw",
  label: "Raw",
  description: "Leave this to the prompt.",
  fragment: "",
};

export const GENRE_PRESETS: DirectorPreset[] = [
  RAW,
  {
    id: "action",
    label: "Action",
    description: "Punchy motion, impact, kinetic energy.",
    fragment:
      "action-genre cinematography, kinetic blocking, decisive movement, high visual energy",
  },
  {
    id: "epic",
    label: "Epic",
    description: "Scale, grandeur, wide heroic frames.",
    fragment:
      "epic cinematic scale, monumental framing, vast depth, heroic presence",
  },
  {
    id: "drama",
    label: "Drama",
    description: "Intimate, held performances, still tension.",
    fragment:
      "dramatic cinematic tone, intimate performance, held pauses, emotional weight",
  },
  {
    id: "comedy",
    label: "Comedy",
    description: "Bright, readable timing, playful blocking.",
    fragment:
      "comedy timing, readable expressions, playful blocking, light cinematic tone",
  },
  {
    id: "horror",
    label: "Horror",
    description: "Unease, shadow, withheld information.",
    fragment:
      "horror-genre tension, withheld information, unsettling stillness, deep shadows",
    negative: "bright sitcom lighting, cheerful mood",
  },
  {
    id: "commercial",
    label: "Commercial",
    description: "Polished brand film / product hero.",
    fragment:
      "high-end commercial, polished product-film language, clean luxury finish",
  },
  {
    id: "documentary",
    label: "Documentary",
    description: "Observational, natural, unforced.",
    fragment:
      "observational documentary language, natural behaviour, unforced realism",
  },
];

export const SHOT_PRESETS: DirectorPreset[] = [
  RAW,
  {
    id: "close_up",
    label: "Close-up",
    description: "Face, product detail, emotion.",
    fragment: "close-up shot, subject fills the frame, sharp eyes, shallow focus",
  },
  {
    id: "medium",
    label: "Medium",
    description: "Waist-up. Dialogue and gesture.",
    fragment: "medium shot, waist-up framing, clear gesture and expression",
  },
  {
    id: "wide",
    label: "Wide",
    description: "Full body in the space.",
    fragment: "wide shot, full body in environment, clear spatial geography",
  },
  {
    id: "extreme_wide",
    label: "Extreme wide",
    description: "Establishing / landscape.",
    fragment: "extreme wide establishing shot, subject small in a vast environment",
  },
  {
    id: "insert",
    label: "Insert / macro",
    description: "Hands, logo, texture.",
    fragment: "macro insert shot, tactile surface detail, tight focus on the object",
  },
];

export const LIGHT_LOOK_PRESETS: DirectorPreset[] = [
  RAW,
  {
    id: "golden_hour",
    label: "Golden hour",
    description: "Warm low sun, long shadows.",
    fragment:
      "golden-hour sunlight, warm low sun, long shadows, gentle backlight rim",
  },
  {
    id: "overcast",
    label: "Overcast",
    description: "Soft, even, no hard sun.",
    fragment: "overcast softbox sky, even diffused light, low contrast shadows",
  },
  {
    id: "studio",
    label: "Studio",
    description: "Keyed commercial lighting.",
    fragment:
      "studio key and fill, controlled commercial lighting, clean catchlights",
  },
  {
    id: "chiaroscuro",
    label: "Chiaroscuro",
    description: "Hard key, deep falloff.",
    fragment:
      "chiaroscuro lighting, hard key from one side, deep falloff into shadow",
  },
  {
    id: "neon",
    label: "Neon night",
    description: "City night, coloured practicals.",
    fragment:
      "night exterior, neon practicals, coloured bounce on wet surfaces",
  },
  {
    id: "moonlight",
    label: "Moonlight",
    description: "Cool night, silver edge.",
    fragment: "moonlit night, cool silver edge light, deep blue shadows",
  },
];

export const GRADE_PRESETS: DirectorPreset[] = [
  RAW,
  {
    id: "natural",
    label: "Natural",
    description: "True colour, mild contrast.",
    fragment: "natural colour grade, true skin tones, mild cinematic contrast",
  },
  {
    id: "teal_orange",
    label: "Teal & orange",
    description: "Blockbuster complementary grade.",
    fragment: "teal-and-orange cinematic grade, warm skin against cool shadows",
  },
  {
    id: "kodak_warm",
    label: "Warm film",
    description: "Kodak-like warmth and grain.",
    fragment: "warm analog film grade, Kodak-like amber highlights, gentle grain",
  },
  {
    id: "cool_steel",
    label: "Cool steel",
    description: "Desaturated, modern, cold.",
    fragment: "cool steel grade, slightly desaturated, crisp modern contrast",
  },
  {
    id: "bleach",
    label: "Bleach bypass",
    description: "Harsh contrast, silvered mids.",
    fragment: "bleach-bypass grade, crushed blacks, silvered midtones, high contrast",
  },
  {
    id: "desert",
    label: "Desert heat",
    description: "Dust, amber, Gulf heat.",
    fragment: "desert-heat grade, amber dust in the air, sun-bleached highlights",
  },
];

export const EMOTION_PRESETS: DirectorPreset[] = [
  RAW,
  {
    id: "calm",
    label: "Calm",
    description: "Held, quiet, unhurried.",
    fragment: "calm composed performance, unhurried pacing, quiet confidence",
  },
  {
    id: "joy",
    label: "Joy",
    description: "Open, bright, genuine.",
    fragment: "genuine joy, open expression, warm easy energy",
  },
  {
    id: "tension",
    label: "Tension",
    description: "Coiled, alert, held breath.",
    fragment: "coiled tension, alert eyes, held breath, restrained movement",
  },
  {
    id: "melancholy",
    label: "Melancholy",
    description: "Soft, inward, slow.",
    fragment: "quiet melancholy, inward gaze, slow emotional rhythm",
  },
  {
    id: "awe",
    label: "Awe",
    description: "Wonder, scale, stillness.",
    fragment: "awe and wonder, still intake of breath, scale against the subject",
  },
  {
    id: "anger",
    label: "Anger",
    description: "Controlled heat, not cartoon rage.",
    fragment: "controlled anger, tight jaw, intense contained energy",
    negative: "cartoon rage, screaming, exaggerated grimace",
  },
];

export const ERA_PRESETS: DirectorPreset[] = [
  RAW,
  {
    id: "contemporary",
    label: "Now",
    description: "Present-day cameras and grade.",
    fragment: "contemporary digital cinema, present-day wardrobe and finish",
  },
  {
    id: "seventies",
    label: "1970s",
    description: "Warm, slightly soft, period stock.",
    fragment: "1970s cinema, warm period colour, slightly soft vintage stock",
  },
  {
    id: "nineties",
    label: "1990s",
    description: "Clean 90s film, modest grain.",
    fragment: "1990s film look, modest grain, clean period colour science",
  },
  {
    id: "vintage_film",
    label: "Vintage film",
    description: "Halation, 35mm, older glass.",
    fragment: "vintage 35mm film, halation on highlights, older spherical glass",
  },
  {
    id: "futuristic",
    label: "Futuristic",
    description: "Sleek, speculative, controlled.",
    fragment: "sleek near-future finish, controlled speculative design, clean lines",
  },
];

export const TEMPO_PRESETS: DirectorPreset[] = [
  RAW,
  {
    id: "single_shot",
    label: "Single shot",
    description: "One take. No cuts.",
    fragment:
      "one continuous single take, no cuts, camera and subject move inside one shot",
    negative: "jump cuts, montage, shot changes",
  },
  {
    id: "calm",
    label: "Calm",
    description: "Slow, held, breathing room.",
    fragment: "calm editing rhythm, long held beats, slow deliberate motion",
  },
  {
    id: "dynamic",
    label: "Dynamic",
    description: "Energetic but readable.",
    fragment: "dynamic pacing, energetic but readable motion, confident rhythm",
  },
  {
    id: "chaotic",
    label: "Chaotic",
    description: "Fast, restless, high density.",
    fragment: "chaotic restless energy, rapid motion, dense visual activity",
    negative: "static locked frame, slow contemplative pacing",
  },
];

export const DEFAULT_DIRECTOR_ID = "raw";

/** Seedance follows these bans more reliably than 4K / 60fps prompt tokens. */
export const SEEDANCE_VIDEO_NEGATIVES =
  "face distortion, limb deformity, clipping, frame skipping, subtitles, on-screen text";

export const DIRECTOR_CONSTRAINT =
  "single coherent cinematic shot, keep character identity and wardrobe consistent, at most two camera movements, no jump cuts";

function resolvePreset(
  list: DirectorPreset[],
  id?: string | null
): DirectorPreset {
  return list.find((p) => p.id === id) ?? list[0]!;
}

export function resolveGenre(id?: string | null) {
  return resolvePreset(GENRE_PRESETS, id);
}
export function resolveShot(id?: string | null) {
  return resolvePreset(SHOT_PRESETS, id);
}
export function resolveLightLook(id?: string | null) {
  return resolvePreset(LIGHT_LOOK_PRESETS, id);
}
export function resolveGrade(id?: string | null) {
  return resolvePreset(GRADE_PRESETS, id);
}
export function resolveEmotion(id?: string | null) {
  return resolvePreset(EMOTION_PRESETS, id);
}
export function resolveEra(id?: string | null) {
  return resolvePreset(ERA_PRESETS, id);
}
export function resolveTempo(id?: string | null) {
  return resolvePreset(TEMPO_PRESETS, id);
}

export type DirectorInputs = {
  genreId?: string | null;
  shotId?: string | null;
  lightLookId?: string | null;
  gradeId?: string | null;
  emotionId?: string | null;
  eraId?: string | null;
  tempoId?: string | null;
};

export function compileDirector(inputs: DirectorInputs): {
  fragments: string[];
  negatives: string[];
  activeCount: number;
  summary: string;
} {
  const picks = [
    resolveShot(inputs.shotId),
    resolveLightLook(inputs.lightLookId),
    resolveGrade(inputs.gradeId),
    resolveGenre(inputs.genreId),
    resolveEmotion(inputs.emotionId),
    resolveEra(inputs.eraId),
    resolveTempo(inputs.tempoId),
  ];
  const active = picks.filter((p) => p.id !== "raw" && p.fragment);
  const fragments = active.map((p) => p.fragment);
  if (active.length > 0) fragments.push(DIRECTOR_CONSTRAINT);
  const negatives = active
    .map((p) => p.negative)
    .filter((n): n is string => Boolean(n));
  const summary = active
    .slice(0, 2)
    .map((p) => p.label)
    .join(" · ");
  return {
    fragments,
    negatives,
    activeCount: active.length,
    summary,
  };
}
