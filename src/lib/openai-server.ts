import "server-only";

/**
 * OpenAI chat client (Layer 1 — prompt translation / copilot). SERVER ONLY.
 *
 * Same shape as `arkChat` in byteplus-server so callers can swap providers.
 * Key + model come from env: OPENAI_API_KEY, OPENAI_CHAT_MODEL (default below).
 */

const OPENAI_BASE = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

export function openaiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function openaiModel(): string {
  return process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini";
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function openaiChat(opts: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("Missing OPENAI_API_KEY env var");

  const model = openaiModel();
  // GPT-4 family uses classic params (max_tokens + free temperature).
  // GPT-5 / o-series require max_completion_tokens and only accept the default
  // temperature, so we send max_completion_tokens universally (forward-safe)
  // and only pass temperature for the older families.
  const legacyParams = /^(gpt-4o|gpt-4\.1|gpt-4-|gpt-4$|gpt-3)/.test(model);
  const payload: Record<string, unknown> = {
    model,
    messages: opts.messages,
    max_completion_tokens: opts.maxTokens ?? 1200,
  };
  if (legacyParams) payload.temperature = opts.temperature ?? 0.4;

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    // Surface OpenAI's own error message (e.g. invalid_api_key, model_not_found)
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI returned empty text — check OPENAI_CHAT_MODEL");
  }
  return text;
}

export type ImageScore = { index: number; score: number; reason: string };

/**
 * Best-of-N auto-score: rate each candidate image against the prompt and basic
 * technical quality, using OpenAI vision. Returns a score 0–100 per candidate.
 */
export async function openaiScoreImages(opts: {
  prompt: string;
  imageUrls: string[];
}): Promise<ImageScore[]> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("Missing OPENAI_API_KEY env var");
  const n = opts.imageUrls.length;
  if (n === 0) return [];

  const system = [
    "You are a meticulous photo QC director for a creative studio.",
    "Score each candidate image 0–100 on: prompt adherence, technical quality",
    "(sharpness, correct anatomy — penalise extra/missing fingers or limbs,",
    "warped faces, distorted logos/text), and freedom from artifacts or",
    "watermarks. Be discerning — spread the scores, don't cluster them.",
    'Return ONLY JSON: {"scores":[{"index":0,"score":92,"reason":"…"}]} with one',
    "entry per candidate (0-based index). Keep each reason under 12 words.",
  ].join(" ");

  const content: unknown[] = [
    {
      type: "text",
      text: `Prompt: ${opts.prompt}\nScore these ${n} candidates (index 0–${n - 1}):`,
    },
  ];
  opts.imageUrls.forEach((url, i) => {
    content.push({ type: "text", text: `Candidate ${i}:` });
    content.push({ type: "image_url", image_url: { url } });
  });

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: openaiModel(),
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      max_completion_tokens: 600,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "{}";
  const parsed = JSON.parse(raw) as { scores?: ImageScore[] };
  const scores = Array.isArray(parsed.scores) ? parsed.scores : [];
  // Clamp + coerce so a wonky model response can't break ranking.
  return scores
    .filter((s) => typeof s.index === "number")
    .map((s) => ({
      index: s.index,
      score: Math.max(0, Math.min(100, Math.round(Number(s.score) || 0))),
      reason: typeof s.reason === "string" ? s.reason : "",
    }));
}

export type BrandCheck = { compliant: boolean; violations: string[] };

/**
 * Brand-guideline enforcement: check an image against a client's brand rules
 * (colours, logo, look, banned elements) using OpenAI vision.
 */
export async function openaiBrandCheck(opts: {
  imageUrl: string;
  brandLook: string;
  bans?: string;
}): Promise<BrandCheck> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("Missing OPENAI_API_KEY env var");

  const system = [
    "You are a brand-compliance reviewer for a creative agency.",
    "Check the image against the client's brand guidelines below.",
    "Flag concrete violations only — wrong/off-brand colours, distorted or",
    "misused logo, banned elements, or a look that clearly contradicts the",
    "guidelines. Ignore minor subjective taste.",
    'Return ONLY JSON: {"compliant":true,"violations":[]} — violations is a list',
    "of short strings (each under 12 words). Empty when it complies.",
  ].join(" ");

  const guidelines = [
    `Brand look: ${opts.brandLook || "(none specified)"}`,
    opts.bans?.trim() ? `Must avoid: ${opts.bans.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: openaiModel(),
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: guidelines },
            { type: "image_url", image_url: { url: opts.imageUrl } },
          ],
        },
      ],
      max_completion_tokens: 400,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "{}";
  const parsed = JSON.parse(raw) as {
    compliant?: boolean;
    violations?: unknown;
  };
  const violations = Array.isArray(parsed.violations)
    ? parsed.violations.filter((v): v is string => typeof v === "string")
    : [];
  return {
    compliant: parsed.compliant !== false && violations.length === 0,
    violations,
  };
}
