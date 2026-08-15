import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { openaiChat, openaiConfigured } from "@/lib/openai-server";

/** Selectable image models and what each is genuinely best at. */
export const IMAGE_MODELS = [
  {
    id: "draft",
    label: "Seedream 4.0",
    bestFor: "fast, cheap drafts, iterations and thumbnails",
  },
  {
    id: "standard",
    label: "Seedream 5.0",
    bestFor: "balanced, general-purpose photorealistic images",
  },
  {
    id: "hero",
    label: "Seedream 5.0 Pro",
    bestFor:
      "highest-fidelity hero and brand stills, multi-reference fusion, crisp 2K",
  },
  {
    id: "nano",
    label: "Nano Banana",
    bestFor:
      "images that need readable text/logos, precise edits, complex compositional instructions, and character/product consistency",
  },
] as const;

type Body = { prompt?: string; current?: string };

export async function POST(req: NextRequest) {
  try {
    // Spends AI credits — viewers must not be able to trigger it.
    const { response: authError } = await requireCreator();
    if (authError) return authError;
    if (!openaiConfigured()) {
      return NextResponse.json({ differs: false });
    }

    const body = (await req.json()) as Body;
    const prompt = body.prompt?.trim();
    if (!prompt) return NextResponse.json({ differs: false });
    const current = IMAGE_MODELS.some((m) => m.id === body.current)
      ? body.current
      : "standard";

    const catalog = IMAGE_MODELS.map(
      (m) => `- ${m.id} (${m.label}): ${m.bestFor}`
    ).join("\n");

    const system = [
      "You route an image prompt to the best-fit model for the studio.",
      "Models:",
      catalog,
      `The user currently has "${current}" selected.`,
      "Pick the single best model id for THIS prompt. Only recommend switching",
      "when another model is clearly better; otherwise pick the current one.",
      'Return ONLY JSON: {"best":"<id>","reason":"<under 18 words, why>"}.',
    ].join("\n");

    let raw: string;
    try {
      raw = await openaiChat({
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        maxTokens: 200,
      });
    } catch {
      return NextResponse.json({ differs: false });
    }

    let parsed: { best?: string; reason?: string };
    try {
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const text = (fenced?.[1] ?? raw).trim();
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      parsed = JSON.parse(s >= 0 && e > s ? text.slice(s, e + 1) : text);
    } catch {
      return NextResponse.json({ differs: false });
    }

    const best = IMAGE_MODELS.find((m) => m.id === parsed.best);
    if (!best || best.id === current) {
      return NextResponse.json({ differs: false });
    }
    return NextResponse.json({
      differs: true,
      best: best.id,
      label: best.label,
      reason: (parsed.reason ?? "").slice(0, 140),
    });
  } catch (err) {
    // Recommendation is advisory — never block generation.
    return NextResponse.json({ differs: false });
  }
}
