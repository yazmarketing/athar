import "server-only";

/**
 * BytePlus ModelArk client (primary provider). Server-only — ARK_API_KEY
 * never reaches the browser.
 *
 * Image API: POST {base}/images/generations (OpenAI-compatible shape).
 * Docs: https://docs.byteplus.com/en/docs/ModelArk
 */

const DEFAULT_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";

function arkBaseUrl() {
  return process.env.ARK_BASE_URL ?? DEFAULT_BASE_URL;
}

function arkKey() {
  const key = process.env.ARK_API_KEY;
  if (!key) throw new Error("Missing ARK_API_KEY env var (BytePlus ModelArk)");
  return key;
}

export type ArkImageRequest = {
  model: string;
  prompt: string;
  /** Pixel size "WxH" (multiples of 16) or resolution level "1K"/"2K" */
  size: string;
  seed?: number;
  watermark?: boolean;
  /** Reference image URL(s) for edit / i2i (Seedream unified API) */
  image?: string | string[];
};

export type ArkImageResult = {
  urls: string[];
  /** Seed echoed back when the API provides it; otherwise the one we sent */
  seed?: number;
  requestId?: string;
};

export async function arkGenerateImage(
  req: ArkImageRequest
): Promise<ArkImageResult> {
  const body: Record<string, unknown> = {
    model: req.model,
    prompt: req.prompt,
    size: req.size,
    seed: req.seed,
    response_format: "url",
    watermark: false,
  };
  if (req.image) {
    body.image = req.image;
    // Only Seedream 4.x knows this batching flag — 5.x rejects the request
    // ("parameter not supported by the current model") if it's present.
    if (req.model.includes("seedream-4")) {
      body.sequential_image_generation = "disabled";
    }
  }

  // Normal renders finish in 10–30s; Pro models at 2K can legitimately take
  // a few minutes. Without a cap a hung connection leaves the UI on
  // "Generating…" forever.
  const timeoutMs = req.model.includes("pro") ? 240_000 : 90_000;
  let res: Response;
  try {
    res = await fetch(`${arkBaseUrl()}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${arkKey()}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error(
        `BytePlus ModelArk did not respond within ${Math.round(timeoutMs / 1000)}s — try again, or use a faster model (Seedream 4.0 / 1K)`
      );
    }
    throw err;
  }

  const json = (await res.json()) as {
    data?: { url?: string }[];
    seed?: number;
    id?: string;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(
      json.error?.message ?? `BytePlus ModelArk error (HTTP ${res.status})`
    );
  }

  const urls = (json.data ?? [])
    .map((d) => d.url)
    .filter((u): u is string => Boolean(u));

  if (urls.length === 0) {
    throw new Error("BytePlus ModelArk returned no images");
  }

  return { urls, seed: json.seed ?? req.seed, requestId: json.id };
}

// ---------------------------------------------------------------------------
// Video — Seedance (async task API)
// ---------------------------------------------------------------------------

export type ArkVideoRequest = {
  model: string;
  prompt: string;
  /** Aspect ratio string, e.g. "16:9" */
  ratio: string;
  /**
   * Verified against the live API: Seedance 2.5 accepts 480p, 720p and 1080p
   * and rejects 2k/4k with InvalidParameter. Validation happens at submit,
   * before a task is created, so an unsupported value fails fast rather than
   * burning a render.
   */
  resolution?: "480p" | "720p" | "1080p";
  /** Clip length in seconds (2.5: 4–30) */
  duration: number;
  generateAudio?: boolean;
  /**
   * Optional attached image URL(s). One image = exact first frame (i2v);
   * two or more = reference images the model blends into the clip.
   */
  imageUrls?: string[];
  /**
   * Optional reference video URL(s) — Seedance 2.x edit/extend. The prompt
   * addresses them as @video1, @video2, … When present, attached images are
   * always sent as reference images (never as first frame).
   */
  videoUrls?: string[];
};

export type ArkVideoResult = {
  url: string;
  requestId: string;
  payload: Record<string, unknown>;
};

export type ArkVideoTask = {
  id?: string;
  status?: string;
  content?: { video_url?: string };
  error?: { message?: string };
  message?: string;
};

async function arkRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${arkBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${arkKey()}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json()) as T & {
    error?: { message?: string };
    message?: string;
  };
  if (!res.ok) {
    throw new Error(
      json.error?.message ??
        json.message ??
        `BytePlus ModelArk error (HTTP ${res.status})`
    );
  }
  return json;
}

/** Build the Seedance task payload from a video request. */
export function buildArkVideoPayload(
  req: ArkVideoRequest
): Record<string, unknown> {
  const content: Record<string, unknown>[] = [
    { type: "text", text: req.prompt },
  ];
  const images = req.imageUrls ?? [];
  const videos = req.videoUrls ?? [];
  // Verified asset-library refs (asset://…) are only valid as reference
  // images, so a single plain image is the only true first-frame case.
  // A reference video also forces images into reference mode.
  const firstFrameMode =
    videos.length === 0 &&
    images.length === 1 &&
    !images[0].startsWith("asset://");
  if (firstFrameMode) {
    content.push({
      type: "image_url",
      image_url: { url: images[0] },
      role: "first_frame",
    });
  } else {
    for (const url of images) {
      content.push({
        type: "image_url",
        image_url: { url },
        role: "reference_image",
      });
    }
  }
  for (const url of videos) {
    content.push({
      type: "video_url",
      video_url: { url },
      role: "reference_video",
    });
  }
  const payload: Record<string, unknown> = {
    model: req.model,
    content,
    resolution: req.resolution ?? "720p",
    // Reference-video tasks (edit/extend) must send -1: Seedance derives the
    // output duration (and ratio) from the input clip and rejects fixed values.
    duration: videos.length > 0 ? -1 : req.duration,
    generate_audio: req.generateAudio ?? true,
  };
  // First-frame generation must not set ratio — the output follows the
  // first-frame image's aspect ratio (ModelArk rejects the param otherwise).
  // Same rule for a reference video: output follows the source clip.
  if (!firstFrameMode && videos.length === 0) {
    payload.ratio = req.ratio;
  }
  return payload;
}

/**
 * Submit a Seedance video task and return immediately with the provider
 * task id. Poll with `arkGetVideoTask`; the durable job layer owns retries.
 */
export async function arkCreateVideoTask(
  req: ArkVideoRequest
): Promise<{ taskId: string; payload: Record<string, unknown> }> {
  const payload = buildArkVideoPayload(req);
  const created = await arkRequest<ArkVideoTask>(
    "/contents/generations/tasks",
    { method: "POST", body: JSON.stringify(payload) }
  );
  if (!created.id) {
    throw new Error("BytePlus ModelArk returned no video task id");
  }
  return { taskId: created.id, payload };
}

/** Fetch the current state of a Seedance video task. */
export async function arkGetVideoTask(taskId: string): Promise<ArkVideoTask> {
  return arkRequest<ArkVideoTask>(`/contents/generations/tasks/${taskId}`);
}

// ---------------------------------------------------------------------------
// Chat — text models (prompt rewrite / editor assist)
// ---------------------------------------------------------------------------

export type ArkChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * OpenAI-compatible chat completions via ModelArk.
 * Model id comes from ARK_CHAT_MODEL (inference endpoint or model slug).
 */
export async function arkChat(opts: {
  messages: ArkChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const model =
    process.env.ARK_CHAT_MODEL?.trim() ||
    process.env.ARK_TEXT_MODEL?.trim() ||
    "seed-1-6-250915";

  const json = await arkRequest<{
    choices?: { message?: { content?: string } }[];
  }>("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1200,
    }),
  });

  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error(
      "ModelArk chat returned empty text — check ARK_CHAT_MODEL is a chat endpoint you have access to"
    );
  }
  return text;
}

