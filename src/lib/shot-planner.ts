import "server-only";
import { getBrandKit } from "@/lib/brand-kits";
import { arkChat } from "@/lib/byteplus-server";
import { openaiChat, openaiConfigured } from "@/lib/openai-server";
import {
  applyContinuity,
  coerceLook,
  coerceShots,
  parsePlannerJson,
  PLAN_ASPECTS,
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

function systemPrompt(count: number, brandLook: string, aspect: string, extra: string) {
  return [
    "You are a creative director planning a visual campaign that must read",
    "as ONE continuous piece — not a set of unrelated images.",

    // 1. Lock the world once. Every shot then inherits it verbatim.
    "First decide a `look`: the exact subject (age, build, hair, distinguishing",
    "features), their exact wardrobe, the exact location, the lighting, and the",
    "colour grade. Be specific enough that two different artists would draw the",
    "same person in the same clothes in the same room.",

    // 2. Only camera and beat may change between shots.
    `Then write exactly ${count} sequenced shots. Across shots, ONLY the shot`,
    "size (wide / medium / close-up), the lens, the subject's action and the",
    "story beat may change. The person, their clothing, the location, the",
    "lighting and the grade must stay identical in every shot.",

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
    "— Emirati architecture and interiors are contemporary and high-specification;",
    "  avoid generic orientalist or desert-cliché staging unless the brief asks.",
    "Apply the same specificity to any other culture, faith or region in the brief.",

    brandLook ? `Honour this brand look throughout: ${brandLook}.` : "",
    extra ? `Additional direction that overrides your own choices: ${extra}.` : "",

    'Return ONLY JSON: {"look":{"subject":"…","wardrobe":"…","location":"…",',
    '"lighting":"…","grade":"…"},"shots":[{"title":"…","prompt":"…",',
    `"motion":"…","shotSize":"…","aspect":"${aspect}"}]}`,
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
): Promise<{ shots: PlannedShot[]; look: PlannedLook | null }> {
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
      content: systemPrompt(count, brandLook, aspect, opts.extraDirection?.trim() ?? ""),
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
      raw = await chat({ messages, temperature: 0.6, maxTokens });
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

  const look = coerceLook(parsed);
  return { shots: applyContinuity(shots, look), look };
}
