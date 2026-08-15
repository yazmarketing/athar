import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { getBrandKit } from "@/lib/brand-kits";
import { arkChat } from "@/lib/byteplus-server";
import { openaiChat, openaiConfigured } from "@/lib/openai-server";

export const maxDuration = 60;

const ASPECTS = ["16:9", "9:16", "1:1", "4:5"];

type Body = {
  brief?: string;
  shotCount?: number;
  brandKitId?: string;
};

type Shot = { title: string; prompt: string; aspect: string };

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
      return {
        title: typeof o.title === "string" ? o.title.slice(0, 80) : "Shot",
        prompt: typeof o.prompt === "string" ? o.prompt.trim() : "",
        aspect,
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
      "You are a creative director planning a visual campaign.",
      `Break the brief into exactly ${count} distinct, sequenced shots that tell`,
      "the story. Each shot needs a vivid, generation-ready image prompt —",
      "concrete subject, setting, action, lighting and mood.",
      brandLook ? `Honour this brand look throughout: ${brandLook}.` : "",
      'Return ONLY JSON: {"shots":[{"title":"…","prompt":"…","aspect":"4:5"}]}',
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

    return NextResponse.json({ shots });
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
