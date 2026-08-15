import { NextRequest, NextResponse } from "next/server";
import { arkChat } from "@/lib/byteplus-server";
import { openaiChat, openaiConfigured, openaiModel } from "@/lib/openai-server";
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

    // Prefer OpenAI (Layer 1 copilot) when a key is set; otherwise fall back to
    // the BytePlus chat model.
    const chat = openaiConfigured() ? openaiChat : arkChat;
    const raw = await chat({
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
      model: openaiConfigured()
        ? openaiModel()
        : (process.env.ARK_CHAT_MODEL ?? "seed-1-6-250915"),
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Improve failed";
    // Turn opaque provider errors into something the studio team can act on.
    const openaiIssue =
      /OpenAI (401|403|404)|invalid_api_key|model_not_found|insufficient_quota|Missing OPENAI_API_KEY/i.test(
        raw
      );
    const noChatModel =
      /ModelNotOpen|does not exist or you do not have access|InvalidEndpointOrModel/i.test(
        raw
      );

    let message = raw;
    let status = 500;
    if (openaiConfigured() && openaiIssue) {
      message =
        "AI prompt-improve failed — check the OpenAI key and model (OPENAI_API_KEY / OPENAI_CHAT_MODEL). If the key is valid, confirm your account has access to that model.";
      status = 503;
    } else if (!openaiConfigured() && noChatModel) {
      message =
        "AI prompt-improve is unavailable: no chat model is configured. Set OPENAI_API_KEY (recommended) or activate a BytePlus text model and set ARK_CHAT_MODEL.";
      status = 503;
    }
    return NextResponse.json({ error: message }, { status });
  }
}
