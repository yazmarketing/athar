import type {
  StoryboardEntityRecord,
  StoryboardPanelRecord,
  StoryboardRegister,
} from "@/lib/types";

/**
 * Turning a panel into a prompt.
 *
 * Kept away from the route so the rules are testable on their own — this file
 * is where a board stops being a list of sentences and becomes a sequence
 * that holds together.
 */

/** Shot sizes, tightest to widest, as the board's vocabulary. */
export const SHOT_SIZES: Record<string, string> = {
  EWS: "extreme wide shot, the figure small in a large environment",
  WS: "wide shot, the full figure and their surroundings",
  MLS: "medium long shot, framed from the knees up",
  MS: "medium shot, framed from the waist up",
  MCU: "medium close-up, framed from the chest up",
  CU: "close-up, the face filling most of the frame",
  ECU: "extreme close-up, a single detail filling the frame",
  OTS: "over-the-shoulder shot, past one figure onto another",
  POV: "point-of-view shot, seen through the subject's own eyes",
  INSERT: "insert shot, a detail or object isolated in frame",
};

export const ANGLES: Record<string, string> = {
  eye: "shot at eye level",
  low: "shot from a low angle, looking up at the subject",
  high: "shot from a high angle, looking down at the subject",
  dutch: "shot with a tilted, canted horizon",
  overhead: "shot from directly overhead, looking straight down",
};

/**
 * How the board is drawn.
 *
 * The style plate is the whole difference between a set of pictures and a
 * board that reads as one artist's hand, so it is stated in full on every
 * panel rather than being left to a reference image to imply.
 */
export const REGISTERS: Record<StoryboardRegister, string> = {
  sketch:
    "Drawn as a traditional storyboard panel: loose grey marker and pencil " +
    "on off-white paper, confident gestural lines, soft grey tonal shading, " +
    "no colour except neutral greys, visible construction strokes. It should " +
    "read as a working board by a professional storyboard artist, not as a " +
    "photograph and not as a finished illustration.",
  line:
    "Drawn as a clean black ink line drawing on white paper: even weight " +
    "contour lines, minimal hatching for shadow, no colour, no rendering, " +
    "no photographic texture. Architectural clarity over atmosphere.",
  mono:
    "Rendered as a black-and-white cinematic frame: full tonal range, film " +
    "grain, no colour at all. Photographic, but graded to monochrome so the " +
    "composition and the light read before anything else.",
  photoreal:
    "Rendered as a photographic film still: cinematic lighting, shallow " +
    "depth of field, colour graded, shot on a full-frame cinema camera.",
};

/** Where the subject faces, so a cut doesn't flip the geography. */
const DIRECTIONS: Record<string, string> = {
  left: "The subject faces and moves toward frame left.",
  right: "The subject faces and moves toward frame right.",
  neutral: "",
  "to-camera": "The subject faces the camera directly.",
};

/**
 * Camera language poisons a still prompt — an image model handed "the camera
 * pushes in" renders the sentence rather than the frame. The planner is told
 * not to write it and this strips it anyway, because planners leak it.
 */
export const MOTION_RE =
  // The leading article is consumed too — stripping "camera pushes in" out of
  // "The camera pushes in" otherwise leaves a stranded "The".
  /\b(?:the\s+|a\s+)?(camera\s+(sweeps?|pans?|tilts?|pushes?|pulls?|tracks?|dollies|glides?|moves?)|sweeps?\s+(from|down|into|across)|pans?\s+(to|across)|zoom(s|ing)?\s+(in|out)|push(es|ing)?\s+in|pull(s|ing)?\s+back|dolly|crane\s+shot|whip\s+pan|match\s+cut|cuts?\s+to|transition(ing|s)?( to)?|slow\s+motion)\b[^.]*\.?/gi;

export function stripMotion(text: string): { still: string; motion: string } {
  const found = text.match(MOTION_RE) ?? [];
  const still = text
    .replace(MOTION_RE, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\.\s*\./g, ".")
    .replace(/^[\s,.]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { still, motion: found.join(" ").trim() };
}

/**
 * Keep screen direction consistent across a sequence.
 *
 * Two people talking must not both face the same way, and someone leaving
 * frame right should enter the next panel from frame left. Planners get this
 * wrong across a long board, and an audience feels it without being able to
 * name it — so it is corrected in code after planning rather than trusted to
 * the model.
 */
export function enforceScreenDirection<
  T extends {
    screenDirection: string;
    entitySlugs: string[];
    shotSize: string;
  },
>(panels: T[]): T[] {
  const lastFacing = new Map<string, "left" | "right">();
  return panels.map((panel) => {
    if (panel.screenDirection === "to-camera") return panel;

    const key = panel.entitySlugs.filter(Boolean).sort().join("+");
    const established = lastFacing.get(key);

    if (panel.screenDirection === "left" || panel.screenDirection === "right") {
      // A deliberate flip is allowed on a wide, which re-establishes the
      // geography for the audience. Anywhere else it's an error.
      const isReestablishing =
        panel.shotSize === "EWS" || panel.shotSize === "WS";
      if (established && established !== panel.screenDirection && !isReestablishing) {
        return { ...panel, screenDirection: established };
      }
      lastFacing.set(key, panel.screenDirection);
      return panel;
    }
    return panel;
  });
}

/** Everything the model needs to know about who is in this panel. */
function entityBlock(entities: StoryboardEntityRecord[]): string {
  return entities
    .map((e) => {
      const parts = [`${e.name}: ${e.description}`];
      if (e.wardrobe.trim()) parts.push(`Wearing ${e.wardrobe}`);
      return parts.join(". ");
    })
    .join(" ");
}

/**
 * Build the prompt for one panel.
 *
 * Order matters: the register first (it governs the whole image), then the
 * frame, then who is in it, then what is happening. Style stated last tends
 * to lose to subject detail.
 */
export function buildPanelPrompt(input: {
  panel: Pick<
    StoryboardPanelRecord,
    "shot_size" | "angle" | "lens" | "screen_direction" | "action"
  >;
  entities: StoryboardEntityRecord[];
  register: StoryboardRegister;
  look: Record<string, unknown> | null;
  /** Correction fed back after a failed continuity check. */
  correction?: string;
}): string {
  const { panel, entities, register, look, correction } = input;
  const lookRecord = (look ?? {}) as Record<string, string>;

  const parts = [
    REGISTERS[register] ?? REGISTERS.sketch,
    SHOT_SIZES[panel.shot_size] ?? SHOT_SIZES.MS,
    ANGLES[panel.angle] ?? ANGLES.eye,
    panel.lens?.trim() ? `Shot on a ${panel.lens}.` : "",
    entities.length ? entityBlock(entities) : "",
    // The action last among content, so it reads as what's happening to the
    // people already described rather than as a fresh scene.
    panel.action?.trim() ? `Action: ${panel.action.trim()}` : "",
    DIRECTIONS[panel.screen_direction] ?? "",
    lookRecord.lighting ? `Lighting: ${lookRecord.lighting}.` : "",
    lookRecord.grade ? `Colour and grade: ${lookRecord.grade}.` : "",
    lookRecord.notes ? String(lookRecord.notes) : "",
    // Panels carry no captions — text baked into the frame can't be edited
    // and looks like a mistake on a client board.
    "No text, no captions, no watermarks, no panel borders or frame numbers " +
      "inside the image.",
    correction?.trim()
      ? `Correction from the previous attempt: ${correction.trim()}`
      : "",
  ];

  return parts
    .filter((p) => p && String(p).trim())
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Build the prompt for a bible sheet — one entity, rendered clean, so every
 * panel containing it has something exact to match.
 */
export function buildEntityPrompt(input: {
  entity: Pick<
    StoryboardEntityRecord,
    "kind" | "name" | "description" | "wardrobe"
  >;
  register: StoryboardRegister;
  look: Record<string, unknown> | null;
}): string {
  const { entity, register, look } = input;
  const lookRecord = (look ?? {}) as Record<string, string>;

  const framing =
    entity.kind === "character"
      ? "A character reference sheet: one person, full figure, standing " +
        "squarely facing the camera, neutral expression, arms relaxed at " +
        "their sides, even flat lighting, plain uncluttered background. The " +
        "whole point is an unambiguous record of who this person is and what " +
        "they are wearing."
      : entity.kind === "location"
        ? "A location reference: the empty space, wide, no people in frame, " +
          "even lighting, showing the layout and the materials clearly."
        : "A prop reference: the single object, centred, plain background, " +
          "even lighting, no hands and no people.";

  return [
    REGISTERS[register] ?? REGISTERS.sketch,
    framing,
    `${entity.name}: ${entity.description}`,
    entity.wardrobe.trim() ? `Wearing ${entity.wardrobe}.` : "",
    lookRecord.grade ? `Colour and grade: ${lookRecord.grade}.` : "",
    "No text, no captions, no labels, no watermarks in the image.",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** A slug the panels can reference: lowercase, hyphenated, stable. */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "entity"
  );
}
