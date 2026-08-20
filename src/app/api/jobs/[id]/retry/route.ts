import { NextRequest, NextResponse, after } from "next/server";
import { logAudit } from "@/lib/audit";
import { requireCreator } from "@/lib/authz";
import { submitImageJob } from "@/lib/image-jobs";
import { getJob, markJobRequeued } from "@/lib/jobs";
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

    // Back in the queue, then submitted after the response — same path as a
    // first render, so a retry can't outrun the gateway either.
    const updated = await markJobRequeued(job.id);
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
