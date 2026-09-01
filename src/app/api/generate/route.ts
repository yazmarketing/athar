import { NextRequest, NextResponse, after } from "next/server";
import { requireCreator } from "@/lib/authz";
import { arkGenerateImage } from "@/lib/byteplus-server";
import { db } from "@/lib/db";
import { getBrandKit } from "@/lib/brand-kits";
import { createJob } from "@/lib/jobs";
import { imageJobModelEndpoint, submitImageJob } from "@/lib/image-jobs";
import { submitVideoJob } from "@/lib/video-jobs";
import { projectExists } from "@/lib/projects";
import { uploadPublicObject } from "@/lib/storage";
import { buildPrompt } from "@/lib/prompt";
import { inferOutputSettings } from "@/lib/prompt-output";
import {
  resolveModel,
  resolveFallbacks,
  asGoogleImageModel,
  maxReferenceImages,
  type ModelEndpoint,
} from "@/config/models";
import type { GenerateRequest } from "@/lib/types";

export const maxDuration = 300;

/** BytePlus ModelArk pixel sizes — multiples of 16. 2K meets Seedream edit min (≥3.686M px). */
const ASPECT_TO_ARK_SIZE_2K: Record<string, string> = {
  "16:9": "2560x1440",
  "9:16": "1440x2560",
  "1:1": "2048x2048",
  "4:5": "1728x2160",
  "21:9": "2944x1264",
};

const ASPECT_TO_ARK_SIZE_1K: Record<string, string> = {
  "16:9": "1280x720",
  "9:16": "720x1280",
  "1:1": "1024x1024",
  "4:5": "896x1120",
  "21:9": "1472x640",
};

function arkSizeFor(aspect: string, resolution: "1K" | "2K"): string {
  const table =
    resolution === "1K" ? ASPECT_TO_ARK_SIZE_1K : ASPECT_TO_ARK_SIZE_2K;
  return table[aspect] ?? (resolution === "1K" ? "1280x720" : "2560x1440");
}

/** Seedream image edits require ≥ ~3.686M pixels (e.g. 2560×1440). */
const EDIT_MIN_PIXELS = 3_686_400;

/** Scale a "WxH" size up (keeping aspect, multiples of 16) to meet a floor. */
export function ensureMinPixels(size: string, minPixels: number): string {
  const [w, h] = size.split("x").map(Number);
  if (!w || !h || minPixels <= 0 || w * h >= minPixels) return size;
  const scale = Math.sqrt(minPixels / (w * h));
  const nw = Math.ceil((w * scale) / 16) * 16;
  const nh = Math.ceil((h * scale) / 16) * 16;
  return `${nw}x${nh}`;
}

/** A row from the generations table, as the insert returns it. */
type GenerationRow = Record<string, unknown>;

type ProviderOutput = {
  url: string;
  seed: number | null;
  requestId: string | null;
  payload: Record<string, unknown>;
  kind: "image" | "video";
  durationS: number | null;
};

async function generateImage(
  model: ModelEndpoint,
  finalPrompt: string,
  _negativePrompt: string,
  aspect: string,
  seed: number,
  referenceUrls: string[] = [],
  resolution: "1K" | "2K" = "2K"
): Promise<ProviderOutput> {
  // Edits require ≥ ~3.686M pixels — force 2K when a reference is present
  const sizeRes =
    referenceUrls.length > 0 && resolution === "1K" ? "2K" : resolution;

  /**
   * Two separate floors, whichever is higher wins:
   *
   * - the model's own minimum (Seedream 5.x refuses anything under 2560×1440
   *   on every request, so a 1K frame is rejected outright), and
   * - the edit floor, which applies to any model once a reference is attached.
   *
   * Scaling up beats failing: the alternative is a provider error the person
   * generating can do nothing useful with.
   */
  const floor = Math.max(
    model.minPixels ?? 0,
    referenceUrls.length > 0 ? EDIT_MIN_PIXELS : 0
  );

  const payload: {
    model: string;
    prompt: string;
    size: string;
    seed: number;
    image?: string | string[];
  } = {
    model: model.slug,
    prompt: finalPrompt,
    size: ensureMinPixels(arkSizeFor(aspect, sizeRes), floor),
    seed,
  };
  if (referenceUrls.length > 0) {
    // Seedream edit/i2i — always send as array of URL or data-URI strings
    payload.image =
      referenceUrls.length === 1 ? referenceUrls[0] : referenceUrls;
  }
  const result = await arkGenerateImage(payload);
  return {
    url: result.urls[0],
    seed: result.seed ?? seed,
    requestId: result.requestId ?? null,
    payload,
    kind: "image",
    durationS: null,
  };
}

/**
 * Routing rule §2.2 (images): try the primary twice, then the fallback chain.
 * Video no longer runs inline — it goes through the durable job layer.
 */
async function generateWithFallback(
  primary: ModelEndpoint,
  fallbacks: ModelEndpoint[],
  finalPrompt: string,
  negativePrompt: string,
  aspect: string,
  seed: number,
  referenceUrls: string[] = [],
  resolution: "1K" | "2K" = "2K"
): Promise<{
  output: ProviderOutput;
  usedModel: ModelEndpoint;
  fallbackNote: string | null;
}> {
  let primaryError: unknown = null;
  let lastError: unknown = null;
  for (const model of [primary, ...fallbacks]) {
    const attempts = model === primary ? 2 : 1;
    for (let i = 0; i < attempts; i++) {
      try {
        const output = await generateImage(
          model,
          finalPrompt,
          negativePrompt,
          aspect,
          seed,
          referenceUrls,
          resolution
        );
        return {
          output,
          usedModel: model,
          fallbackNote:
            model === primary
              ? null
              : `Primary ${primary.provider}:${primary.slug} failed; used fallback ${model.provider}:${model.slug}`,
        };
      } catch (err) {
        lastError = err;
        if (model === primary && primaryError === null) primaryError = err;
      }
    }
  }
  // The primary's error is the meaningful one to report
  const errToThrow = primaryError ?? lastError;
  throw errToThrow instanceof Error
    ? errToThrow
    : new Error("All models failed");
}

/**
 * Copy the render into our own storage.
 *
 * Returns the stored URL plus the provider reference worth keeping. Gemini
 * hands back the image inline as a base64 data URI rather than a link — that
 * is the whole payload, not a reference, so it must never reach `fal_url` or
 * the JSON response. A 2K still runs to several MB of base64 and a 4K one to
 * tens; echoed back through the gateway it fails the request outright.
 */
async function persistOutput(
  output: ProviderOutput,
  mode: "t2i" | "t2v"
): Promise<{ url: string; providerUrl: string | null }> {
  const inlineData = output.url.startsWith("data:");
  try {
    const res = await fetch(output.url);
    const blob = await res.arrayBuffer();
    const contentType =
      res.headers.get("content-type") ??
      (output.kind === "video" ? "video/mp4" : "image/png");
    const ext =
      output.kind === "video"
        ? "mp4"
        : contentType.includes("webp")
          ? "webp"
          : contentType.includes("jpeg")
            ? "jpg"
            : "png";
    const path = `${mode}/${Date.now()}-${output.seed ?? "v"}.${ext}`;
    const url = await uploadPublicObject(path, blob, contentType);
    return { url, providerUrl: inlineData ? null : output.url };
  } catch (err) {
    // A provider URL still works as a fallback; inline data has nowhere to
    // live, so say so rather than returning megabytes of base64 as a "URL".
    if (inlineData) {
      const detail = err instanceof Error ? err.message : "unknown error";
      throw new Error(`Could not store the generated image — ${detail}`);
    }
    return { url: output.url, providerUrl: output.url };
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCreator();
  if (auth.response) return auth.response;
  const sessionUser = auth.user;

  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.mode !== "t2i" && body.mode !== "t2v") {
    return NextResponse.json(
      { error: "Only Text → Image and Text → Video are available" },
      { status: 400 }
    );
  }
  if (!body.prompt?.subject?.trim()) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const projectId: string | null = body.projectId ?? null;
  if (projectId) {
    if (!UUID_RE.test(projectId)) {
      return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
    }
    if (!(await projectExists(projectId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  // Brand kit: merge its prompt guidance server-side so every client applies
  // the same rules, and stamp the id for lineage/filtering.
  const brandKitId: string | null = body.brandKitId ?? null;
  if (brandKitId) {
    if (!UUID_RE.test(brandKitId)) {
      return NextResponse.json({ error: "Invalid brandKitId" }, { status: 400 });
    }
    const kit = await getBrandKit(brandKitId);
    if (!kit) {
      return NextResponse.json({ error: "Brand kit not found" }, { status: 404 });
    }
    if (kit.brand_tokens) {
      body.prompt.brandTokens = [body.prompt.brandTokens?.trim(), kit.brand_tokens]
        .filter(Boolean)
        .join(", ");
    }
    if (kit.negative_additions) {
      body.prompt.negativeAdditions = [
        body.prompt.negativeAdditions?.trim(),
        kit.negative_additions,
      ]
        .filter(Boolean)
        .join(", ");
    }
  }

  const mode = body.mode;
  const tier = body.tier ?? "draft";
  // Director prompts name the frame in the text ("9:16 vertical"); the dock
  // defaults to 16:9, so honour the prompt when it is explicit.
  const inferred = inferOutputSettings(
    [body.prompt.subject, body.prompt.action, body.prompt.lighting]
      .filter(Boolean)
      .join("\n")
  );
  const aspect = inferred.aspect ?? body.aspect ?? "16:9";
  const numOutputs = Math.min(body.numOutputs ?? 1, mode === "t2v" ? 2 : 4);
  const baseSeed = body.seed ?? Math.floor(Math.random() * 2 ** 31);
  // Nano Banana Pro holds consistency across more references than Seedream
  // fuses, so the ceiling follows the model the request is actually routed to.
  const googleModel =
    body.mode === "t2i" ? asGoogleImageModel(body.imageModel) : null;
  let referenceUrls = (body.referenceUrls ?? [])
    .filter(Boolean)
    .slice(0, maxReferenceImages(googleModel));

  const { finalPrompt, negativePrompt } = buildPrompt(body.prompt);
  // Prefer Seedream standard+ for edits (better i2i than draft / fal)
  const editTier = referenceUrls.length > 0 && tier === "draft" ? "standard" : tier;
  const primary = resolveModel(mode, editTier);
  const fallbacks =
    referenceUrls.length > 0
      ? resolveFallbacks(mode).filter((m) => m.provider === "byteplus")
      : resolveFallbacks(mode);
  const durationS = Math.min(
    Math.max(
      inferred.durationS ?? body.durationS ?? (mode === "t2v" ? 5 : 0),
      mode === "t2v" ? 4 : 0
    ),
    primary.maxDuration || 30
  );
  // 4K only exists on the Nano Banana Pro path; Seedream renders it at 2K.
  const resolution: "1K" | "2K" | "4K" =
    body.resolution === "1K"
      ? "1K"
      : body.resolution === "4K" && googleModel === "nano-banana-pro"
        ? "4K"
        : "2K";
  const arkResolution: "1K" | "2K" = resolution === "1K" ? "1K" : "2K";

  // Video: submit a Seedance task and return a durable job immediately.
  // The render keeps going server-side; the client polls /api/jobs/[id].
  // Attached images switch the capability to i2v: one image is the exact
  // first frame, several become reference images blended into the clip.
  if (mode === "t2v") {
    // Seedance 2.0 series accepts up to 9 reference images
    const sourceImageUrls = (body.sourceImageUrls ?? [])
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, 9);
    // Attached source video → v2v edit/extend (Seedance reference_video)
    const sourceVideoUrl = body.sourceVideoUrl?.trim() || null;
    const kind = sourceVideoUrl
      ? ("v2v" as const)
      : sourceImageUrls.length
        ? ("i2v" as const)
        : ("t2v" as const);
    const videoModel = sourceVideoUrl
      ? resolveModel("v2v", editTier)
      : sourceImageUrls.length
        ? resolveModel("i2v", editTier)
        : primary;
    // Reference-video tasks send duration -1 to Seedance, so the picker
    // value is ignored. Record the source length instead of a fake 15s.
    const sourceDuration = Number(body.sourceDurationS);
    const videoDuration = sourceVideoUrl
      ? Number.isFinite(sourceDuration) && sourceDuration > 0
        ? sourceDuration
        : null
      : Math.min(
          Math.max(durationS, 4),
          videoModel.maxDuration || 30
        );
    try {
      const job = await createJob({
        kind,
        modelEndpoint: `${videoModel.provider}:${videoModel.slug}`,
        tier: editTier,
        input: { ...body, prompt: body.prompt },
        finalPrompt,
        negativePrompt,
        aspect,
        durationS: videoDuration,
        userId: sessionUser.id,
        projectId,
        brandKitId,
      });
      /**
       * Submitting is not the quick handshake it reads as: ModelArk fetches
       * and moderates every attached still before it hands back a task id,
       * and for an i2v render off a 2K frame that can outlive the gateway —
       * which is what surfaced in the browser as "the render ran longer than
       * the gateway allows". The job row is the durable record, so it is
       * enough to answer with; the submit happens once the response is out,
       * and a poll re-submits it if this process dies first.
       */
      after(() => submitVideoJob(job.id));
      return NextResponse.json({ job }, { status: 202 });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not queue the render";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // Nano Banana: queue a durable job and return immediately. Gemini Pro often
  // outruns the gateway; the studio polls /api/jobs/[id] the same way as video.
  if (googleModel) {
    try {
      const jobs: Awaited<ReturnType<typeof createJob>>[] = [];
      for (let i = 0; i < numOutputs; i++) {
        const job = await createJob({
          kind: "t2i",
          provider: "google",
          modelEndpoint: imageJobModelEndpoint(googleModel),
          tier: editTier,
          input: {
            ...body,
            prompt: body.prompt,
            imageModel: googleModel,
            resolution,
            seed: baseSeed + i,
            referenceUrls,
          },
          finalPrompt,
          negativePrompt,
          aspect,
          durationS: null,
          userId: sessionUser.id,
          projectId,
          brandKitId,
        });
        jobs.push(job);
        after(() => submitImageJob(job.id));
      }
      return NextResponse.json(
        { job: jobs[0], jobs },
        { status: 202 }
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not queue the image";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // BytePlus often can't fetch third-party CDNs; inline as data URIs for edits
  if (referenceUrls.length > 0) {
    referenceUrls = await Promise.all(
      referenceUrls.map(async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return url;
          const buf = Buffer.from(await res.arrayBuffer());
          const contentType = res.headers.get("content-type") ?? "image/jpeg";
          if (buf.byteLength > 8_000_000) return url; // keep URL if huge
          return `data:${contentType};base64,${buf.toString("base64")}`;
        } catch {
          return url;
        }
      })
    );
  }

  const pool = db();

  /** Render and store one Seedream still of the batch. */
  const renderOne = async (i: number) => {
    const seed = baseSeed + i;
    // Measure the provider round-trip so the detail panel can report how long
    // the render actually took (completed_at - created_at is always ~0 here,
    // since the row is only inserted once the render is already finished).
    const renderStart = Date.now();
    const generated = await generateWithFallback(
      primary,
      fallbacks,
      finalPrompt,
      negativePrompt,
      aspect,
      seed,
      referenceUrls,
      arkResolution
    );

    const { output, usedModel, fallbackNote } = generated;
    const { url: outputUrl, providerUrl } = await persistOutput(output, mode);
    const cost =
      usedModel.unit === "image"
        ? usedModel.costPerUnit
        : usedModel.costPerUnit * (output.durationS ?? durationS);

    const { rows } = await pool.query(
      `insert into generations
         (mode, tier, model_endpoint, input_payload, final_prompt,
          negative_prompt, seed, reference_urls, status, output_url,
          fal_url, request_id, cost, aspect, duration_s, client_ready,
          user_id, project_id, brand_kit_id, render_ms, completed_at)
       values
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, now())
       returning *`,
      [
        mode,
        editTier,
        `${usedModel.provider}:${usedModel.slug}`,
        JSON.stringify({
          ...output.payload,
          prompt_inputs: body.prompt,
          fallback_note: fallbackNote,
          duration_s: output.durationS,
          is_edit: (body.referenceUrls ?? []).length > 0,
          resolution: mode === "t2i" ? resolution : undefined,
        }),
        finalPrompt,
        negativePrompt,
        output.seed,
        body.referenceUrls ?? [],
        "ready",
        outputUrl,
        providerUrl,
        output.requestId,
        cost,
        aspect,
        output.durationS,
        false,
        sessionUser.id,
        projectId,
        brandKitId,
        Date.now() - renderStart,
      ]
    );
    return rows[0];
  };

  // Concurrently, not one after another: a batch of four used to take four
  // renders back to back, which is how a set of variations outran the
  // gateway's patience and surfaced as "Failed to fetch" in the browser.
  const settled = await Promise.allSettled(
    Array.from({ length: numOutputs }, (_, i) => renderOne(i))
  );
  const records = settled
    .filter((r): r is PromiseFulfilledResult<GenerationRow> => r.status === "fulfilled")
    .map((r) => r.value);

  if (records.length === 0) {
    const reason = settled.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    const message =
      reason?.reason instanceof Error
        ? reason.reason.message
        : "Generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ generation: records[0], generations: records });
}
