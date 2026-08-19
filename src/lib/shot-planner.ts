import "server-only";
import { getBrandKit } from "@/lib/brand-kits";
import { arkChat } from "@/lib/byteplus-server";
import { openaiChat, openaiConfigured } from "@/lib/openai-server";
import {
  coerceBanned,
  coerceCast,
  coerceLook,
  coerceShots,
  parsePlannerJson,
  PLAN_ASPECTS,
  type PlannedCastMember,
  type PlannedLook,
  type PlannedShot,
} from "@/lib/shot-plan";

export type PlanOptions = {
  brief: string;
  shotCount?: number;
  brandKitId?: string | null;
  /** Preferred frame for the whole set; the planner may still vary it. */
  aspect?: string;
  /** Extra direction — a storyboard's existing look, a client note. */
  extraDirection?: string;
  /**
   * A look the user has approved. Sent as fact rather than as a suggestion,
   * and returned unchanged, so re-planning the shots never re-rolls the
   * wardrobe out from under them.
   */
  lockedLook?: PlannedLook | null;
  /** A cast the user has approved — reused verbatim rather than re-invented. */
  lockedCast?: PlannedCastMember[] | null;
};

export class PlannerError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/** Thrown-error text that means "no chat model is wired up", not "bad input". */
export function isPlannerUnavailable(message: string) {
  return /ModelNotOpen|insufficient_quota|invalid_api_key|Missing OPENAI/i.test(
    message
  );
}

export const PLANNER_UNAVAILABLE_MESSAGE =
  "The planner needs a chat model — add OpenAI credits or set ARK_CHAT_MODEL.";

function systemPrompt(
  count: number,
  brandLook: string,
  aspect: string,
  extra: string,
  locked: PlannedLook | null,
  lockedCast: PlannedCastMember[] | null
) {
  return [
    "You are a creative director planning a visual campaign that must read",
    "as ONE continuous piece — not a set of unrelated images.",

    // 1. Lock the world once. Every shot then inherits it verbatim.
    "First decide the `look` of the WORLD: the exact location, the lighting and",
    "the colour grade. Be specific enough that two different artists would draw",
    "the same place in the same light. Leave `subject` and `wardrobe` empty —",
    "people belong in `cast`, not in the world.",

    // 2. The brief decides who is in frame — not you.
    `Then write exactly ${count} sequenced shots, following the brief beat for`,
    "beat and in its order.",

    "WHO IS IN A SHOT IS THE BRIEF'S DECISION, NOT YOURS. Put a person in a",
    "frame only where the brief actually calls for one. Landscapes, textures,",
    "irrigation lines, skies, inserts and details usually contain NO PEOPLE at",
    "all, and adding a figure to them is a mistake — it flattens the sequence",
    "and contradicts the direction. An empty `cast` is a normal, correct answer",
    "and will often be the answer for the opening beats.",

    "Where the brief DOES name people, list them once in `cast`, each with a",
    "short fixed identity string covering age, build, hair, distinguishing",
    "features and exact wardrobe. Every shot then names the cast ids present in",
    "that shot. Reuse the SAME id whenever it is the same person, so a",
    "character recurring in shots 3, 6 and 11 is held to one identity; give a",
    "genuinely different person a DIFFERENT id. Never re-describe a character",
    "inside a shot prompt — the identity string is added automatically.",

    "Across shots the shot size, lens, action and story beat change freely. The",
    "location, lighting and grade stay consistent within a scene unless the",
    "brief says time is passing.",

    // 3. Stills and motion are different languages.
    "`prompt` describes a STILL FRAME only. Never put camera movement,",
    "transitions, or words like 'sweeps', 'pans', 'cuts to', 'transition' in",
    "`prompt` — an image model renders the sentence instead of the picture.",
    "Put any camera move or transition in `motion` instead.",

    // 4. Cultural precision. Vague cultural nouns produce wrong, often
    //    offensive output, so force concrete, correct description.
    "CULTURAL ACCURACY IS MANDATORY. Never use a bare nationality or a vague",
    "garment name and hope the model knows it. Describe the actual garment,",
    "how it is worn, and the setting, precisely and respectfully.",
    "For Emirati/Gulf subjects specifically:",
    "— An Emirati woman wears a flowing black abaya (an open or closed robe worn",
    "  over her clothes, often with subtle embroidery or a tailored modern cut)",
    "  with a shayla: a long black rectangular scarf draped over the head and",
    "  swept over the shoulders. It is NOT a chador, NOT a tight wrapped hijab,",
    "  and NOT a shapeless enveloping cloak.",
    "— An Emirati man wears a crisp white kandura (ankle-length robe) with a",
    "  ghutra headscarf (white or red-and-white checked) held by a black agal.",
    "— An Emirati BOY wears a white kandura like the men, usually without the",
    "  ghutra and agal at a young age; sandals are normal. An Emirati GIRL wears",
    "  a modest dress or a jalabiya; a young girl need not be covered.",
    "— Emirati architecture and interiors are contemporary and high-specification;",
    "  avoid generic orientalist or desert-cliché staging unless the brief asks.",
    "Apply the same specificity to any other culture, faith or region in the brief.",

    // 4b. The failure this exists to stop: the planner is free to choose the
    //     wardrobe when the brief does not name one, and on one pass it chose
    //     national dress and on the next a shirt and trousers. National dress
    //     is the default, not a coin flip.
    "WARDROBE IS NOT A FREE CHOICE. When the brief does not state what the",
    "subject wears and the subject belongs to a culture with national dress,",
    "you MUST dress them in that national dress. For Emirati, Gulf, Khaleeji or",
    "UAE subjects that means the kandura / abaya described above. NEVER put such",
    "a subject in Western casual clothing — no t-shirt, polo, cotton work shirt,",
    "jeans, chinos, olive trousers, hoodie or sneakers — unless the brief",
    "explicitly asks for it.",

    // 4c. Anything the brief actually specifies outranks the planner.
    "THE BRIEF OUTRANKS YOU. Any garment, prop, location, colour, action or",
    "prohibition the brief states must be carried through exactly as written,",
    "not replaced with something similar. If the brief describes a beat that is",
    "not a photograph — a black screen, a title card, silence over darkness —",
    "still write it as its own shot and say plainly that the frame is black.",

    // 4d. Prohibitions become a negative prompt, which the model obeys far
    //     more reliably than a sentence asking for absence.
    'Collect everything that must NOT appear into "banned": short noun phrases',
    'such as "buildings", "vehicles", "other people", "text", "logos". Include',
    "anything the brief rules out, plus anything that would break the world you",
    "just described. Do not phrase them as sentences and do not negate them —",
    'write "buildings", never "no buildings".',

    brandLook ? `Honour this brand look throughout: ${brandLook}.` : "",
    extra ? `Additional direction that overrides your own choices: ${extra}.` : "",

    // A look the user already approved is settled. Restating it as a decision
    // already taken stops the planner quietly improving on it.
    locked
      ? [
          "THE WORLD IS ALREADY DECIDED and is not yours to change. Use it",
          "exactly, and return it back verbatim in `look`:",
          locked.location && `location: ${locked.location}`,
          locked.lighting && `lighting: ${locked.lighting}`,
          locked.grade && `grade: ${locked.grade}`,
        ]
          .filter(Boolean)
          .join(" ")
      : "",
    lockedCast && lockedCast.length > 0
      ? [
          "THE CAST IS ALREADY DECIDED. Use these exact people, these exact ids",
          "and these exact identity strings, and return them verbatim in",
          "`cast`. Do not rename, re-describe or re-dress anyone:",
          ...lockedCast.map((c) => `${c.id} — ${c.name}: ${c.description}`),
        ].join(" ")
      : "",

    // 5. Craft. What separates a designed frame from a generated one.
    "CRAFT, applied to every shot prompt:",
    "— Composition: place the focal point off-centre on a third unless dead",
    "  centre is a deliberate, formal choice. Give the eye a path into the",
    "  frame. Build three readable depth planes, never a single flat plane.",
    "— Light: one light logic per scene — direction, colour temperature and",
    "  hardness hold across the scene, and shadows fall the way the stated key",
    "  light implies.",
    "— Focus: a wide is about the environment and takes deep focus; a close-up",
    "  or insert takes shallow focus. Match the two.",
    "— Never describe on-screen text, signage, captions, logos, emblems or",
    "  flags. Those are composited in post, and a model that invents Arabic",
    "  script produces something visibly wrong. Leave the space empty instead.",

    // 6. Beats that are not photographs.
    "If a beat is deliberately not an image — a black screen, silence over",
    "darkness — return it as a shot with isBlank true, an empty cast, and a",
    "one-line prompt saying what the beat is. Do not turn it into a picture.",

    'Return ONLY JSON: {"look":{"subject":"…","wardrobe":"…","location":"…",',
    '"lighting":"…","grade":"…"},',
    '"cast":[{"id":"short-slug","name":"…","description":"…"}],"banned":["…"],',
    '"shots":[{"title":"…","prompt":"…","motion":"…","shotSize":"…",',
    `"cast":["short-slug"],"isBlank":false,"aspect":"${aspect}"}]}`,
    `aspect is one of ${PLAN_ASPECTS.join(", ")}; prefer ${aspect}.`,
    "shotSize is one of Wide, Medium, Close-up, Extreme close-up, Over-the-shoulder.",
    "Keep titles under 6 words.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Layer 4 — brief → shot list. Returns generation-ready still prompts with a
 * locked look already folded into each one.
 */
export async function planShots(
  opts: PlanOptions
): Promise<{
  shots: PlannedShot[];
  look: PlannedLook | null;
  cast: PlannedCastMember[];
  banned: string[];
}> {
  const brief = opts.brief.trim();
  if (!brief) throw new PlannerError("A brief is required", 400);

  const count = Math.min(Math.max(opts.shotCount ?? 4, 1), 12);
  const aspect = (PLAN_ASPECTS as readonly string[]).includes(opts.aspect ?? "")
    ? (opts.aspect as string)
    : "4:5";

  let brandLook = "";
  if (opts.brandKitId) {
    const kit = await getBrandKit(opts.brandKitId).catch(() => null);
    if (kit) brandLook = kit.brand_tokens;
  }

  const messages = [
    {
      role: "system" as const,
      content: systemPrompt(
        count,
        brandLook,
        aspect,
        opts.extraDirection?.trim() ?? "",
        opts.lockedLook ?? null,
        opts.lockedCast ?? null
      ),
    },
    { role: "user" as const, content: brief },
  ];
  // Scales with the shot count — twelve detailed frames need far more room
  // than four, and a budget that fits the small case silently truncates the
  // large one.
  const maxTokens = Math.min(1200 + count * 320, 6000);

  // Try OpenAI, then fall back to ModelArk. One provider being unhappy — an
  // empty completion, a rate limit, a model that isn't open on the account —
  // shouldn't be the difference between having a storyboard and not.
  let raw = "";
  let firstError: Error | null = null;
  const providers = openaiConfigured() ? [openaiChat, arkChat] : [arkChat];
  for (const chat of providers) {
    try {
        // Low temperature on purpose. Shot ideas benefit from variety; the
      // wardrobe of an Emirati boy does not, and 0.6 was enough to make it a
      // coin flip between a kandura and a cotton shirt.
      raw = await chat({ messages, temperature: 0.25, maxTokens });
      break;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      firstError ??= e;
    }
  }
  if (!raw) throw firstError ?? new PlannerError("The planner did not respond");

  let parsed: unknown;
  try {
    parsed = parsePlannerJson(raw);
  } catch {
    throw new PlannerError("Could not read the shot list — try again");
  }

  const shots = coerceShots(parsed, aspect);
  if (shots.length === 0) {
    throw new PlannerError("No shots came back — try a more specific brief");
  }

  // Raw shots and the look, kept apart. Campaign folds the look into every
  // prompt; a storyboard stores it on the board and composes per frame, since
  // a board's frames are meant to differ from one another.
  return {
    shots,
    // The user's approved look is the answer, whatever the model echoed back.
    look: opts.lockedLook ?? coerceLook(parsed),
    cast: opts.lockedCast ?? coerceCast(parsed),
    banned: coerceBanned(parsed),
  };
}
