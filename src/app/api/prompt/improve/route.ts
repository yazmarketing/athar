import { NextRequest, NextResponse } from "next/server";
import { arkChat } from "@/lib/byteplus-server";
import type { PromptInputs } from "@/lib/types";

export const maxDuration = 60;

type Body = {
  prompt?: PromptInputs;
  mode?: "t2i" | "t2v";
  instruction?: string;
};

function extractJsonObject(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("Model did not return valid JSON");
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const prompt = body.prompt;
    if (!prompt?.subject?.trim()) {
      return NextResponse.json(
        { error: "Prompt subject is required" },
        { status: 400 }
      );
    }

    const mode = body.mode === "t2v" ? "t2v" : "t2i";
    const extra = body.instruction?.trim();

    const system = [
      "You are a prompt engineer for BytePlus Seedream (images) and Seedance (video).",
      "Improve the user's structured prompt for higher visual fidelity and clearer direction.",
      "Keep brand intent and factual product/person details intact.",
      "Do not invent brand logos or watermark text.",
      "Return ONLY a JSON object with keys:",
      '  "subject" (required string),',
      '  "action" (optional string),',
      '  "lighting" (optional string),',
      '  "brandTokens" (optional string),',
      '  "negativeAdditions" (optional string of things to avoid).',
      "No markdown commentary outside the JSON.",
      mode === "t2v"
        ? "Bias toward camera motion, pacing, and cinematic shot language."
        : "Bias toward composition, materials, wardrobe, and photographic detail.",
    ].join(" ");

    const user = [
      `Mode: ${mode}`,
      extra ? `Extra instruction: ${extra}` : null,
      "Current fields:",
      JSON.stringify(
        {
          subject: prompt.subject,
          action: prompt.action ?? "",
          lighting: prompt.lighting ?? "",
          brandTokens: prompt.brandTokens ?? "",
          negativeAdditions: prompt.negativeAdditions ?? "",
        },
        null,
        2
      ),
    ]
      .filter(Boolean)
      .join("\n");

    const raw = await arkChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.35,
      maxTokens: 1400,
    });

    const parsed = extractJsonObject(raw);
    const subject = asString(parsed.subject);
    if (!subject) {
      return NextResponse.json(
        { error: "AI returned no subject — try again" },
        { status: 502 }
      );
    }

    const improved: PromptInputs = {
      subject,
      action: asString(parsed.action) || undefined,
      lighting: asString(parsed.lighting) || undefined,
      brandTokens: asString(parsed.brandTokens) || undefined,
      negativeAdditions: asString(parsed.negativeAdditions) || undefined,
    };

    return NextResponse.json({
      prompt: improved,
      model: process.env.ARK_CHAT_MODEL ?? "seed-1-6-250915",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Improve failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
