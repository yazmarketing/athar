import "server-only";

/** Shared server client. Astra uses Responses; explicitly selected legacy
 * chat models keep their compatible endpoint. Model access errors surface
 * unchanged: this layer never silently chooses another model. */
export function openaiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function openaiModel(): string {
  return process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-6-astra";
}

export type OpenAIContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenAIContent[];
};
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export class OpenAIError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly type: string | null;
  readonly param: string | null;
  readonly requestId: string | null;
  constructor(message: string, details: {
    status?: number; code?: string | null; type?: string | null;
    param?: string | null; requestId?: string | null;
  } = {}) {
    super(message);
    this.name = "OpenAIError";
    this.status = details.status ?? 502;
    this.code = details.code ?? null;
    this.type = details.type ?? null;
    this.param = details.param ?? null;
    this.requestId = details.requestId ?? null;
  }
}

/** Parse once, preserving HTTP status and request id even for non-JSON errors. */
export async function readOpenAIResponse<T>(res: Response): Promise<T> {
  const raw = await res.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch {
    throw new OpenAIError(`OpenAI ${res.status}: ${res.ok ? "Invalid JSON response" : raw.slice(0, 300) || res.statusText}`, {
      status: res.ok ? 502 : res.status, code: "invalid_response", requestId: res.headers.get("x-request-id"),
    });
  }
  if (!body || typeof body !== "object") {
    throw new OpenAIError("OpenAI returned an invalid response", { code: "invalid_response" });
  }
  if (!res.ok || body.error) {
    const err = (body.error && typeof body.error === "object" ? body.error : {}) as Record<string, unknown>;
    const str = (value: unknown) => typeof value === "string" ? value : null;
    throw new OpenAIError(`OpenAI ${res.status}: ${(str(err.message) || res.statusText || "Request failed").slice(0, 300)}`, {
      status: res.ok ? 502 : res.status, code: str(err.code), type: str(err.type),
      param: str(err.param), requestId: res.headers.get("x-request-id"),
    });
  }
  return body as T;
}

export async function openaiChat(opts: {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  /** Existing callers specify desired visible output; reasoning gets headroom. */
  maxTokens?: number;
  /** Explicit Responses total budget, including reasoning. */
  maxOutputTokens?: number;
  reasoningEffort?: ReasoningEffort;
  json?: boolean;
  signal?: AbortSignal;
}): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new OpenAIError("Missing OPENAI_API_KEY env var", { status: 503, code: "missing_api_key" });
  const model = opts.model ?? openaiModel();
  const legacy = /^(gpt-4|gpt-3)/.test(model);
  const reasoning = /^(gpt-[56]|o[134])/.test(model);
  const budget = opts.maxOutputTokens ?? ((opts.maxTokens ?? 1200) + (reasoning ? 6000 : 0));
  if (!Number.isSafeInteger(budget) || budget <= 0 || budget > 128_000) {
    throw new OpenAIError("Output token budget must be between 1 and 128000", { status: 400, code: "invalid_token_budget" });
  }
  const payload: Record<string, unknown> = legacy
    ? {
        model, messages: opts.messages, max_completion_tokens: budget,
        temperature: opts.temperature ?? 0.4,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }
    : {
        model,
        input: opts.messages.map((message) => ({
          role: message.role,
          content: typeof message.content === "string" ? message.content : message.content.map((part) =>
            part.type === "text"
              ? { type: "input_text", text: part.text }
              : { type: "input_image", image_url: part.image_url.url, detail: part.image_url.detail ?? "auto" }
          ),
        })),
        max_output_tokens: budget,
        store: false,
        ...(reasoning ? { reasoning: { effort: opts.reasoningEffort ?? "medium" } } : {}),
        ...(opts.json ? { text: { format: { type: "json_object" } } } : {}),
      };
  const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/${legacy ? "chat/completions" : "responses"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
    signal: opts.signal ?? AbortSignal.timeout(240_000),
  });
  const json = await readOpenAIResponse<{
    status?: string;
    incomplete_details?: { reason?: string };
    output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
    choices?: { finish_reason?: string; message?: { content?: string; refusal?: string } }[];
  }>(res);
  const choice = json.choices?.[0];
  const content = (json.output ?? []).filter((item) => item.type === "message").flatMap((item) => item.content ?? []);
  const refusal = legacy ? choice?.message?.refusal : content.find((part) => part.type === "refusal")?.refusal;
  if (refusal) throw new OpenAIError(`OpenAI declined this request: ${refusal.slice(0, 200)}`, { code: "refusal" });
  if (json.status === "incomplete" || choice?.finish_reason === "length") {
    throw new OpenAIError(`${model} returned an incomplete response (${json.incomplete_details?.reason ?? "output token limit"}). Increase the output budget or shorten the request.`, { code: "incomplete_response", requestId: res.headers.get("x-request-id") });
  }
  if (json.status && json.status !== "completed") {
    throw new OpenAIError(`${model} response status: ${json.status}`, { code: "incomplete_response" });
  }
  const text = (legacy ? choice?.message?.content : content.filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("\n"))?.trim();
  if (!text) throw new OpenAIError(`${model} returned no text`, { code: "empty_response" });
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

  const content: OpenAIContent[] = [
    {
      type: "text",
      text: `Prompt: ${opts.prompt}\nScore these ${n} candidates (index 0–${n - 1}):`,
    },
  ];
  opts.imageUrls.forEach((url, i) => {
    content.push({ type: "text", text: `Candidate ${i}:` });
    content.push({ type: "image_url", image_url: { url } });
  });

  const raw = await openaiChat({
    messages: [{ role: "system", content: system }, { role: "user", content }],
    maxTokens: 1200,
    json: true,
  });
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

  const raw = await openaiChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: [
        { type: "text", text: guidelines },
        { type: "image_url", image_url: { url: opts.imageUrl } },
      ] },
    ],
    maxTokens: 800,
    json: true,
  });
  const parsed = JSON.parse(raw) as {
    compliant?: boolean;
    violations?: unknown;
  };
  if (typeof parsed.compliant !== "boolean" || !Array.isArray(parsed.violations)) {
    throw new OpenAIError("OpenAI returned an invalid brand review", { code: "invalid_review" });
  }
  const violations = Array.isArray(parsed.violations)
    ? parsed.violations.filter((v): v is string => typeof v === "string")
    : [];
  return {
    compliant: parsed.compliant !== false && violations.length === 0,
    violations,
  };
}
