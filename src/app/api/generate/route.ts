import { NextRequest, NextResponse, after } from "next/server";
import { requireCreator } from "@/lib/authz";
import { getBrandKit } from "@/lib/brand-kits";
import { createJob } from "@/lib/jobs";
import { imageJobModelEndpoint, submitImageJob } from "@/lib/image-jobs";
import { submitVideoJob } from "@/lib/video-jobs";
import { getProject } from "@/lib/projects";
import { checkSpendControls, similarVideoRenderCount } from "@/lib/render-guardrails";
import { buildPrompt } from "@/lib/prompt";
import {
  inferOutputSettings,
  lockPromptAspect,
  resolveGenerateAspect,
} from "@/lib/prompt-output";
import {
  resolveModel,
  asGoogleImageModel,
  asOpenAIImageModel,
  imageAllows4K,
  maxReferenceImages,
  googleImageCost,
  openaiImageCost,
} from "@/config/models";
import type { GenerateRequest } from "@/lib/types";

export const maxDuration = 300;

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
  let projectClientId: string | null = null;
  if (projectId) {
    if (!UUID_RE.test(projectId)) {
      return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
    }
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    projectClientId = project.client_id;
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
  // Dock chip wins. Inference only fills in a missing/invalid aspect — the
  // studio already mirrors director-prompt ratios onto the chip as you type,
  // so a later "21:9" token must not override a 16:9 the person just picked.
  // Duration stays the same rule: the chip beats camera timestamps.
  const promptText = [
    body.prompt.subject,
    body.prompt.action,
    body.prompt.lighting,
  ]
    .filter(Boolean)
    .join("\n");
  const inferred = inferOutputSettings(promptText);
  const aspect = resolveGenerateAspect(body.aspect, promptText);
  const numOutputs = Math.min(body.numOutputs ?? 1, mode === "t2v" ? 2 : 4);
  const baseSeed = body.seed ?? Math.floor(Math.random() * 2 ** 31);
  // Nano Banana Pro and GPT Image 2 hold consistency across more references
  // than Seedream fuses, so the ceiling follows the model the request is
  // actually routed to.
  const googleModel =
    body.mode === "t2i" ? asGoogleImageModel(body.imageModel) : null;
  const openaiModel =
    body.mode === "t2i" ? asOpenAIImageModel(body.imageModel) : null;
  const routedImageModel = googleModel ?? openaiModel;
  const referenceUrls = (body.referenceUrls ?? [])
    .filter(Boolean)
    .slice(0, maxReferenceImages(routedImageModel));

  const built = buildPrompt(body.prompt);
  const { finalPrompt, negativePrompt } = lockPromptAspect(
    built.finalPrompt,
    built.negativePrompt,
    aspect
  );
  // Prefer Seedream standard+ for edits (better i2i than draft / fal)
  const editTier = referenceUrls.length > 0 && tier === "draft" ? "standard" : tier;
  const primary = resolveModel(mode, editTier);
  const durationS = Math.min(
    Math.max(
      body.durationS ?? inferred.durationS ?? (mode === "t2v" ? 5 : 0),
      mode === "t2v" ? 4 : 0
    ),
    primary.maxDuration || 30
  );
  // 4K only exists on Nano Banana 2/Pro and GPT Image; Seedream renders it at 2K.
  const resolution: "1K" | "2K" | "4K" =
    body.resolution === "1K"
      ? "1K"
      : body.resolution === "4K" && imageAllows4K(routedImageModel)
        ? "4K"
        : "2K";
  const arkResolution: "1K" | "2K" = resolution === "1K" ? "1K" : "2K";

  // Video: submit a Seedance task and return a durable job immediately.
  // The render keeps going server-side; the client polls /api/jobs/[id].
  // Attached images switch the capability to i2v: one image is the exact
  // first frame, several become reference images blended into the clip.
  if (mode === "t2v") {
    if (!projectId) {
      return NextResponse.json(
        { error: "Choose a client project before starting a video render", code: "project_required" },
        { status: 400 }
      );
    }
    if (!projectClientId) {
      return NextResponse.json(
        { error: "Video renders must use a project linked to a client", code: "client_project_required" },
        { status: 400 }
      );
    }
    if (body.clientId !== projectClientId) {
      return NextResponse.json(
        { error: "Choose a project linked to the selected client", code: "project_client_mismatch" },
        { status: 400 }
      );
    }
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
    const estimatedCost = videoModel.costPerUnit * (videoDuration ?? 5);
    if ((videoDuration ?? 0) >= 13 && (videoDuration ?? 0) <= 30 && !body.longRenderApproved) {
      return NextResponse.json(
        {
          error: "Approval is required for Seedance renders from 13 to 30 seconds.",
          code: "long_render_approval_required",
          estimatedCost,
          durationS: videoDuration,
        },
        { status: 409 }
      );
    }
    if (!body.duplicatePromptApproved) {
      const similarCount = await similarVideoRenderCount(sessionUser.id, projectId, finalPrompt);
      if (similarCount >= 3) {
        return NextResponse.json(
          {
            error: `This is similar to ${similarCount} recent renders in this project.`,
            code: "duplicate_prompt_warning",
            similarCount,
            estimatedCost,
          },
          { status: 409 }
        );
      }
    }
    const spend = await checkSpendControls({ userId: sessionUser.id, projectId, proposedCost: estimatedCost });
    if (!spend.allowed) {
      return NextResponse.json({ error: spend.error, code: "spend_cap_exceeded" }, { status: 409 });
    }
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
        estimatedCost,
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
      return NextResponse.json({ job, spendAlerts: spend.alerts }, { status: 202 });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not queue the render";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  /**
   * Stills: queue a durable job per output and return immediately — Nano
   * Banana Pro, GPT Image 2 and a Seedream 2K edit all routinely outrun the
   * App Platform gateway, which used to surface in the browser as an HTML
   * 504 page ("Unexpected token '<'"). The render runs after the response
   * via `submitImageJob` (which dispatches on provider); clients poll
   * /api/jobs/[id] the same way as video.
   */
  const provider = openaiModel ? "openai" : googleModel ? "google" : "byteplus";
  const imageUnitCost = openaiModel
    ? openaiImageCost(openaiModel, resolution)
    : googleModel
      ? googleImageCost(googleModel, resolution)
      : primary.costPerUnit;
  const estimatedCost = imageUnitCost * numOutputs;
  const spend = await checkSpendControls({ userId: sessionUser.id, projectId, proposedCost: estimatedCost });
  if (!spend.allowed) {
    return NextResponse.json({ error: spend.error, code: "spend_cap_exceeded" }, { status: 409 });
  }
  try {
    const jobs: Awaited<ReturnType<typeof createJob>>[] = [];
    for (let i = 0; i < numOutputs; i++) {
      const job = await createJob({
        kind: "t2i",
        provider,
        modelEndpoint: routedImageModel
          ? imageJobModelEndpoint(routedImageModel)
          : `${primary.provider}:${primary.slug}`,
        tier: editTier,
        input: {
          ...body,
          prompt: body.prompt,
          imageModel: routedImageModel ?? undefined,
          resolution: routedImageModel ? resolution : arkResolution,
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
        estimatedCost: imageUnitCost,
      });
      jobs.push(job);
      after(() => submitImageJob(job.id));
    }
    return NextResponse.json(
      { job: jobs[0], jobs, spendAlerts: spend.alerts },
      { status: 202 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not queue the image";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
