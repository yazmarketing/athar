import { ASPECT_RATIOS } from "@/config/aspects";

/**
 * Pure helpers behind the shot planner — shared by the Campaign orchestrator
 * and Storyboards. Deliberately free of server-only imports so the parsing
 * and motion-stripping rules can be unit-tested directly.
 */

export const PLAN_ASPECTS = ASPECT_RATIOS;

/**
 * A recurring character. `description` is the fixed identity string reused
 * verbatim in every frame this character appears in — never re-described from
 * memory shot to shot, which is what lets a face survive to frame twelve.
 */
export type PlannedCastMember = {
  id: string;
  name: string;
  description: string;
};

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
  /**
   * Which cast members are in THIS frame. Empty is the common and correct
   * answer for landscape, texture and insert shots — a treatment whose first
   * beats are pure land should not have a person standing in them.
   */
  cast: string[];
  /** A deliberate non-image beat: a black screen. */
  isBlank?: boolean;
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

/**
 * Things that must not appear, as short noun phrases fit for a negative
 * prompt. A model obeys "buildings, vehicles" in the negative far more
 * reliably than "there are no buildings" in the positive, so leading negations
 * are stripped rather than passed through.
 */
/** Stable, prompt-safe id for a cast member. */
function slug(value: string, fallback: string): string {
  const out = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return out || fallback;
}

export function coerceCast(raw: unknown): PlannedCastMember[] {
  const arr =
    raw && typeof raw === "object" && Array.isArray((raw as { cast?: unknown[] }).cast)
      ? (raw as { cast: unknown[] }).cast
      : [];
  const seen = new Set<string>();
  const out: PlannedCastMember[] = [];
  arr.forEach((entry, i) => {
    const o = (entry ?? {}) as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const description =
      typeof o.description === "string" ? o.description.trim() : "";
    if (!description) return;
    const id = slug(
      typeof o.id === "string" && o.id.trim() ? o.id : name,
      `character-${i + 1}`
    );
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, name: name || id, description });
  });
  return out.slice(0, 8);
}

export function coerceBanned(raw: unknown): string[] {
  const arr =
    raw && typeof raw === "object" && Array.isArray((raw as { banned?: unknown[] }).banned)
      ? (raw as { banned: unknown[] }).banned
      : [];
  const cleaned = arr
    .filter((v): v is string => typeof v === "string")
    .map((v) =>
      v
        .trim()
        .replace(/^(no|not|never|without|avoid|exclude)\s+/i, "")
        .replace(/[.]+$/, "")
        .trim()
        .toLowerCase()
    )
    .filter((v) => v.length > 0 && v.length <= 60);
  return Array.from(new Set(cleaned)).slice(0, 20);
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
      const cast = Array.isArray(o.cast)
        ? (o.cast as unknown[])
            .filter((c): c is string => typeof c === "string")
            .map((c) => slug(c, ""))
            .filter(Boolean)
        : [];
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
        cast,
        isBlank: o.isBlank === true || o.is_blank === true,
      };
    })
    // A black frame has no picture to describe, so an empty prompt is valid
    // for it and only for it.
    .filter((s) => s.prompt.length > 0 || s.isBlank);
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

/** Longest identity text we will append to a single image prompt. */
const IDENTITY_MAX = 320;

/**
 * The identity strings for the characters actually in this frame.
 *
 * Only the named cast members are included. A frame with an empty cast gets
 * nothing — which is the correct and common answer for a landscape, a texture
 * or an insert, and the reason a treatment opening on bare land no longer
 * comes back with a child standing in it.
 */
export function castTail(
  cast: PlannedCastMember[],
  ids: string[]
): string {
  if (ids.length === 0) return "";
  const present = ids
    .map((id) => cast.find((c) => c.id === id))
    .filter((c): c is PlannedCastMember => Boolean(c));
  if (present.length === 0) return "";

  const tail = present.map((c) => c.description.trim()).join(" ");
  if (tail.length <= IDENTITY_MAX) return tail;
  const cut = tail.slice(0, IDENTITY_MAX);
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

/**
 * Standard framing, plus the focus logic that belongs with it: a wide is about
 * the environment and wants deep focus; a close-up is about one thing and
 * wants the background to fall away. Stating it stops the model pairing a
 * locked-off establishing wide with a heavily blurred background, which reads
 * immediately as a mismatch.
 */
const SHOT_SIZE_PREFIX: Record<string, string> = {
  Wide: "Wide shot, deep focus — the environment is the subject.",
  Medium: "Medium shot, moderate depth of field.",
  "Close-up": "Close-up, shallow depth of field, background falling away.",
  "Extreme close-up":
    "Extreme close-up macro, very shallow depth of field.",
  "Over-the-shoulder": "Over-the-shoulder shot, subject in focus.",
};

/**
 * Craft floor applied to every frame: three readable depth planes and a
 * composition that is not dead-centre by default. Short on purpose — this sits
 * alongside the shot description, it does not compete with it.
 */
const CRAFT_TAIL =
  "Composed in three readable depth planes — foreground, midground, background.";

/**
 * Never let the model invent language. Garbled Arabic script or a
 * reinterpreted logo in a client frame is both immediately visible and
 * genuinely damaging; text and marks are composited in post instead.
 */
export const ALWAYS_BANNED =
  "text, lettering, signage, captions, subtitles, watermark, logo, emblem, " +
  "flag, arabic script, garbled writing";

export function composeFramePrompt(opts: {
  prompt: string;
  shotSize?: string | null;
  /** The board's cast, and which of them are in this frame. */
  cast?: PlannedCastMember[];
  castIds?: string[];
  /** Positive tokens from the board's visual style. */
  stylePositive?: string;
  /** True when the render already carries reference images. */
  hasReferences: boolean;
}): string {
  const shot = stripLegacyContinuity(opts.prompt);
  return [
    opts.shotSize ? SHOT_SIZE_PREFIX[opts.shotSize] : "",
    shot,
    // With reference images attached the pictures hold identity far better
    // than a paragraph, and keeping both simply crowds the shot again.
    opts.hasReferences ? "" : castTail(opts.cast ?? [], opts.castIds ?? []),
    CRAFT_TAIL,
    opts.stylePositive ?? "",
  ]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** Everything this frame must not contain, ready for the negative prompt. */
export function composeFrameNegative(banned: string[], styleNegative?: string) {
  return [ALWAYS_BANNED, banned.join(", "), styleNegative]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Fold the look into every shot. Used by Campaign, where the whole point is
 * one person in one place across a handful of shots and the frames are
 * generated immediately with nowhere to persist a look.
 *
 * Storyboards deliberately do NOT use this — they keep a cast on the board and
 * compose per frame via `composeFramePrompt`, because a board's frames are
 * supposed to differ and most of them may contain no one at all.
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
