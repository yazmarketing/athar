import { NextRequest, NextResponse, after } from "next/server";
import { logAudit } from "@/lib/audit";
import { requireCreator } from "@/lib/authz";
import { submitImageJob } from "@/lib/image-jobs";
import { getJob, markJobRequeued, resumeProviderJob } from "@/lib/jobs";
import { arkGetVideoTask } from "@/lib/byteplus-server";
import { checkSpendControls } from "@/lib/render-guardrails";
import { isImageJob } from "@/lib/types";
import { submitVideoJob } from "@/lib/video-jobs";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    // A local timeout or storage failure does not mean the paid render failed.
    // Resume polling the original task before considering another submission.
    if (!isImageJob(job) && job.provider_task_id) {
      const task = await arkGetVideoTask(job.provider_task_id);
      if (!["failed", "expired", "cancelled"].includes(task.status ?? "")) {
        const resumed = await resumeProviderJob(job.id, job.provider_task_id);
        return NextResponse.json({ job: resumed ?? await getJob(job.id) });
      }
    }
    const spend = await checkSpendControls({ userId: job.user_id ?? sessionUser.id, projectId: job.project_id, proposedCost: Number(job.estimated_cost ?? 0) });
    if (!spend.allowed) {
      return NextResponse.json({ error: sessionUser.role === "admin" ? spend.error : "This project needs a manager’s review before another render. Your work is saved." }, { status: 409 });
    }

    // Back in the queue, then submitted after the response — same path as a
    // first render, so a retry can't outrun the gateway either.
    const updated = await markJobRequeued(job.id);
    if (!updated) return NextResponse.json({ job: await getJob(job.id) });
    after(() =>
      isImageJob(job) ? submitImageJob(job.id) : submitVideoJob(job.id)
    );

    await logAudit({
      userId: sessionUser.id,
      userEmail: sessionUser.email,
      action: "job_retry",
      subjectType: "generation_job",
      subjectId: job.id,
    });

    return NextResponse.json({ job: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Retry failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
