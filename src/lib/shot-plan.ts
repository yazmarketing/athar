/**
 * Pure helpers behind the shot planner — shared by the Campaign orchestrator
 * and Storyboards. Deliberately free of server-only imports so the parsing
 * and motion-stripping rules can be unit-tested directly.
 */

export const PLAN_ASPECTS = ["16:9", "9:16", "1:1", "4:5"] as const;

export type PlannedShot = {
  title: string;
  /** Describes a STILL FRAME. Never contains camera movement. */
  prompt: string;
  aspect: string;
  /**
   * Camera move / transition for when this still becomes footage. Kept OUT
   * of `prompt`: an image model handed "camera sweeps down into the hands"
   * tries to render the sentence rather than the frame.
   */
  motion?: string;
  /** Wide / medium / close-up etc., when the planner names one. */
  shotSize?: string;
};

/** The locked look every shot inherits, so the set reads as one piece. */
export type PlannedLook = {
  subject: string;
  wardrobe: string;
  location: string;
  lighting: string;
  grade: string;
};

/**
 * Camera/transition language that belongs in `motion`, not in a still prompt.
 * Planners leak it even when told not to, and the image model then renders
 * the instruction instead of the frame.
 */
export const MOTION_RE =
  /\b(camera\s+(sweeps?|pans?|tilts?|pushes?|pulls?|tracks?|dollies|glides?|moves?)|sweeps?\s+(from|down|into|across)|pans?\s+(to|across)|zoom(s|ing)?\s+(in|out)|push(es|ing)?\s+in|pull(s|ing)?\s+back|dolly|crane\s+shot|whip\s+pan|match\s+cut|cuts?\s+to|transition(ing|s)?( to)?|slow\s+motion)\b[^.]*\.?/gi;

export function stripMotion(text: string): { still: string; motion: string } {
  const found = text.match(MOTION_RE) ?? [];
  const still = text
    .replace(MOTION_RE, "")
    // Tidy the punctuation the removal leaves behind (", ," / " .," / "..").
    .replace(/\s*,\s*,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\.\s*\./g, ".")
    .replace(/^[\s,.]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { still, motion: found.join(" ").trim() };
}

export function coerceLook(raw: unknown): PlannedLook | null {
  const o =
    raw && typeof raw === "object"
      ? ((raw as { look?: unknown }).look as Record<string, unknown> | undefined)
      : undefined;
  if (!o) return null;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const look = {
    subject: str("subject"),
    wardrobe: str("wardrobe"),
    location: str("location"),
    lighting: str("lighting"),
    grade: str("grade"),
  };
  return Object.values(look).some(Boolean) ? look : null;
}

export function coerceShots(raw: unknown, fallbackAspect = "4:5"): PlannedShot[] {
  const arr =
    raw && typeof raw === "object" && Array.isArray((raw as { shots?: unknown[] }).shots)
      ? (raw as { shots: unknown[] }).shots
      : [];
  return arr
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const aspect =
        typeof o.aspect === "string" &&
        (PLAN_ASPECTS as readonly string[]).includes(o.aspect)
          ? o.aspect
          : fallbackAspect;
      const rawPrompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
      const { still, motion } = stripMotion(rawPrompt);
      const declared = typeof o.motion === "string" ? o.motion.trim() : "";
      return {
        title: typeof o.title === "string" ? o.title.slice(0, 80) : "Shot",
        prompt: still,
        aspect,
        motion: [declared, motion].filter(Boolean).join(" ").trim() || undefined,
        shotSize:
          typeof o.shotSize === "string"
            ? o.shotSize.slice(0, 40)
            : typeof o.shot_size === "string"
              ? (o.shot_size as string).slice(0, 40)
              : undefined,
      };
    })
    .filter((s) => s.prompt.length > 0);
}

/**
 * The locked look, written for a PLANNER — a text model that is producing a
 * whole set and can act on "identical in every shot".
 *
 * Never send this to an image model. It renders one frame and has no notion of
 * a set, so the labels are noise at best; and at ~900 characters it buries a
 * fifteen-word shot description under a boilerplate that is itself a picture
 * ("a boy in a white kandura in a farm at dawn"), which is how six different
 * frames came back as the same photograph.
 */
export function continuityBrief(look: PlannedLook | null): string {
  if (!look) return "";
  return [
    look.subject && `Subject (identical in every shot): ${look.subject}.`,
    look.wardrobe && `Wardrobe (unchanged): ${look.wardrobe}.`,
    look.location && `Location (unchanged): ${look.location}.`,
    look.lighting && `Lighting: ${look.lighting}.`,
    look.grade && `Colour grade: ${look.grade}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Longest identity tail we will append to a single image prompt. */
const IDENTITY_TAIL_MAX = 260;

/**
 * The minimum needed to keep one person recognisable across frames, as plain
 * prose in whatever language the look was written in — no labels, no
 * meta-instructions, and only who they are and what they wear.
 *
 * Location, lighting and grade are deliberately left out: those belong to the
 * shot, which is allowed to move between frames. Repeating them is what
 * pinned every frame to the same establishing wide.
 */
export function identityTail(look: PlannedLook | null): string {
  if (!look) return "";
  const tail = [look.subject, look.wardrobe]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (tail.length <= IDENTITY_TAIL_MAX) return tail;
  // Trim on a word boundary rather than mid-word.
  const cut = tail.slice(0, IDENTITY_TAIL_MAX);
  return cut.slice(0, cut.lastIndexOf(" ")).trim();
}

/**
 * Boards planned before the split have the full `continuityBrief` baked into
 * every stored frame prompt. The label below is a stable, unambiguous marker
 * for where that block starts, so an existing board is cleaned up on the next
 * render instead of needing a re-plan that would throw away hand edits.
 */
const LEGACY_CONTINUITY_MARKER = /\s*Subject \(identical in every shot\):[\s\S]*$/;

export function stripLegacyContinuity(prompt: string): string {
  return prompt.replace(LEGACY_CONTINUITY_MARKER, "").trim();
}

/** Standard framing, sent as a short leading clause the model acts on. */
const SHOT_SIZE_PREFIX: Record<string, string> = {
  Wide: "Wide shot.",
  Medium: "Medium shot.",
  "Close-up": "Close-up shot.",
  "Extreme close-up": "Extreme close-up shot.",
  "Over-the-shoulder": "Over-the-shoulder shot.",
};

/**
 * Build the prompt for one frame: framing first, the shot itself next, and the
 * identity tail last and only when it is actually carrying weight.
 *
 * With reference images attached the tail is dropped entirely — the pictures
 * hold identity far better than a paragraph of description, and leaving both
 * in simply re-creates the crowding this whole split exists to remove.
 */
export function composeFramePrompt(opts: {
  prompt: string;
  shotSize?: string | null;
  look?: PlannedLook | null;
  /** True when the render already carries reference images. */
  hasReferences: boolean;
}): string {
  const shot = stripLegacyContinuity(opts.prompt);
  return [
    opts.shotSize ? SHOT_SIZE_PREFIX[opts.shotSize] : "",
    shot,
    opts.hasReferences ? "" : identityTail(opts.look ?? null),
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Fold the locked look into every shot. Used by Campaign, where the whole
 * point is one person in one place across a handful of shots and the frames
 * are generated immediately without anywhere to persist the look.
 *
 * Storyboards deliberately do NOT use this — they keep the look on the board
 * and compose per frame via `composeFramePrompt`, because a board's frames are
 * supposed to differ.
 */
export function applyContinuity(
  shots: PlannedShot[],
  look: PlannedLook | null
): PlannedShot[] {
  const line = continuityBrief(look);
  if (!line) return shots;
  return shots.map((shot) => ({ ...shot, prompt: `${shot.prompt} ${line}` }));
}

/** Pull the JSON object out of a chat reply that may be fenced or chatty. */
export function parsePlannerJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced?.[1] ?? raw).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
}
