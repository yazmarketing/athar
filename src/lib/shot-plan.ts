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

/** Render the locked look as a sentence every shot prompt can carry. */
export function continuityLine(look: PlannedLook | null): string {
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

/**
 * Fold the locked look into every shot so continuity survives even though
 * each shot is generated as its own request. Without this the model
 * re-invents the person, their clothes and the room on every frame — the
 * single reason the old shot lists never read as one campaign.
 */
export function applyContinuity(
  shots: PlannedShot[],
  look: PlannedLook | null
): PlannedShot[] {
  const line = continuityLine(look);
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
