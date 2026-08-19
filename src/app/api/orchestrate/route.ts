import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { getBrandKit } from "@/lib/brand-kits";
import { arkChat } from "@/lib/byteplus-server";
import { openaiChat, openaiConfigured } from "@/lib/openai-server";
// Shared with the storyboard planner: both hand still prompts to an image
// model, and both need camera language kept out of them.
import { stripMotion } from "@/lib/storyboard-prompt";

export const maxDuration = 60;

const ASPECTS = ["16:9", "9:16", "1:1", "4:5"];

type Body = {
  brief?: string;
  shotCount?: number;
  brandKitId?: string;
};

type Shot = {
  title: string;
  prompt: string;
  aspect: string;
  /**
   * Camera move / transition for when this still becomes footage. Kept OUT
   * of `prompt`: an image model handed "camera sweeps down into the hands"
   * tries to render the sentence rather than the frame.
   */
  motion?: string;
};

/** The locked look every shot inherits, so the set reads as one campaign. */
type Look = {
  subject: string;
  wardrobe: string;
  location: string;
  lighting: string;
  grade: string;
};


function coerceLook(raw: unknown): Look | null {
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

function coerceShots(raw: unknown): Shot[] {
  const arr =
    raw && typeof raw === "object" && Array.isArray((raw as { shots?: unknown[] }).shots)
      ? (raw as { shots: unknown[] }).shots
      : [];
  return arr
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const aspect =
        typeof o.aspect === "string" && ASPECTS.includes(o.aspect)
          ? o.aspect
          : "4:5";
      const rawPrompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
      const { still, motion } = stripMotion(rawPrompt);
      const declared = typeof o.motion === "string" ? o.motion.trim() : "";
      return {
        title: typeof o.title === "string" ? o.title.slice(0, 80) : "Shot",
        prompt: still,
        aspect,
        motion: [declared, motion].filter(Boolean).join(" ").trim() || undefined,
      };
    })
    .filter((s) => s.prompt.length > 0);
}

/**
 * Layer 4 — brief → shot-list. Turns a campaign brief into a structured,
 * editable list of shots, each with a generation-ready image prompt.
 */
export async function POST(req: NextRequest) {
  try {
    // Spends AI credits — viewers must not be able to trigger it.
    const { response: authError } = await requireCreator();
    if (authError) return authError;

    const body = (await req.json()) as Body;
    const brief = body.brief?.trim();
    if (!brief) {
      return NextResponse.json({ error: "A brief is required" }, { status: 400 });
    }
    const count = Math.min(Math.max(body.shotCount ?? 4, 1), 8);

    let brandLook = "";
    if (body.brandKitId) {
      const kit = await getBrandKit(body.brandKitId).catch(() => null);
      if (kit) brandLook = kit.brand_tokens;
    }

    const system = [
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

      'Return ONLY JSON: {"look":{"subject":"…","wardrobe":"…","location":"…",',
      '"lighting":"…","grade":"…"},"shots":[{"title":"…","prompt":"…",',
      '"motion":"…","aspect":"4:5"}]}',
      `aspect is one of ${ASPECTS.join(", ")}. Keep titles under 6 words.`,
    ]
      .filter(Boolean)
      .join(" ");

    const chat = openaiConfigured() ? openaiChat : arkChat;
    const raw = await chat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: brief },
      ],
      temperature: 0.6,
      maxTokens: 1600,
    });

    let parsed: unknown;
    try {
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const text = (fenced?.[1] ?? raw).trim();
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      parsed = JSON.parse(
        start >= 0 && end > start ? text.slice(start, end + 1) : text
      );
    } catch {
      return NextResponse.json(
        { error: "Could not read the shot list — try again" },
        { status: 502 }
      );
    }

    const shots = coerceShots(parsed);
    if (shots.length === 0) {
      return NextResponse.json(
        { error: "No shots came back — try a more specific brief" },
        { status: 502 }
      );
    }

    // Fold the locked look into every shot so continuity survives even though
    // each shot is generated as its own request. Without this the model
    // re-invents the person, their clothes and the room on every frame — the
    // single reason the old shot lists never read as one campaign.
    const look = coerceLook(parsed);
    const continuity = look
      ? [
          look.subject && `Subject (identical in every shot): ${look.subject}.`,
          look.wardrobe && `Wardrobe (unchanged): ${look.wardrobe}.`,
          look.location && `Location (unchanged): ${look.location}.`,
          look.lighting && `Lighting: ${look.lighting}.`,
          look.grade && `Colour grade: ${look.grade}.`,
        ]
          .filter(Boolean)
          .join(" ")
      : "";

    const composed = shots.map((shot) => ({
      ...shot,
      prompt: continuity ? `${shot.prompt} ${continuity}` : shot.prompt,
    }));

    return NextResponse.json({ shots: composed, look });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Orchestrate failed";
    const noModel =
      /ModelNotOpen|insufficient_quota|invalid_api_key|Missing OPENAI/i.test(raw);
    return NextResponse.json(
      {
        error: noModel
          ? "The planner needs a chat model — add OpenAI credits or set ARK_CHAT_MODEL."
          : raw,
      },
      { status: noModel ? 503 : 500 }
    );
  }
}
