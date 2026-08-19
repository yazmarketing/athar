import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { requireCreator } from "@/lib/authz";
import { arkCreateVideoTask } from "@/lib/byteplus-server";
import { getJob, markJobRequeued } from "@/lib/jobs";
import { resolveModel, type Tier } from "@/config/models";

type Params = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ASPECT_TO_VIDEO_RATIO: Record<string, string> = {
  "16:9": "16:9",
  "9:16": "9:16",
  "1:1": "1:1",
  "4:5": "9:16",
  "21:9": "16:9",
};

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const sessionUser = auth.user;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (job.status !== "failed" && job.status !== "cancelled") {
      return NextResponse.json(
        { error: `Cannot retry a ${job.status} job` },
        { status: 400 }
      );
    }

    const model = resolveModel(
      job.kind === "i2v" || job.kind === "v2v" ? job.kind : "t2v",
      job.tier as Tier
    );
    const durationS = job.duration_s != null ? Number(job.duration_s) : 5;
    const retryInput = job.input as {
      sourceImageUrl?: string | null; // legacy single-image jobs
      sourceImageUrls?: string[] | null;
      sourceVideoUrl?: string | null;
      videoResolution?: "480p" | "720p" | "1080p";
    };
    const sourceImages = retryInput.sourceImageUrls?.length
      ? retryInput.sourceImageUrls
      : retryInput.sourceImageUrl
        ? [retryInput.sourceImageUrl]
        : [];
    const sourceVideoUrl = retryInput.sourceVideoUrl?.trim() || null;

    const { taskId } = await arkCreateVideoTask({
      model: model.slug,
      prompt: job.final_prompt,
      ratio: ASPECT_TO_VIDEO_RATIO[job.aspect] ?? "16:9",
      resolution:
        retryInput.videoResolution === "480p"
          ? "480p"
          : retryInput.videoResolution === "1080p"
            ? "1080p"
            : "720p",
      duration: durationS,
      generateAudio: model.supportsAudio,
      imageUrls: sourceImages.length ? sourceImages : undefined,
      videoUrls: sourceVideoUrl ? [sourceVideoUrl] : undefined,
    });

    const updated = await markJobRequeued(job.id, taskId);

    await logAudit({
      userId: sessionUser.id,
      userEmail: sessionUser.email,
      action: "job_retry",
      subjectType: "generation_job",
      subjectId: job.id,
      meta: { provider_task_id: taskId },
    });

    return NextResponse.json({ job: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Retry failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
