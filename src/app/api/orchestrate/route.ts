import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { applyContinuity } from "@/lib/shot-plan";
import {
  isPlannerUnavailable,
  PLANNER_UNAVAILABLE_MESSAGE,
  PlannerError,
  planShots,
} from "@/lib/shot-planner";

export const maxDuration = 60;

type Body = {
  brief?: string;
  shotCount?: number;
  brandKitId?: string;
};

/**
 * Layer 4 — brief → shot-list. Turns a campaign brief into a structured,
 * editable list of shots, each with a generation-ready image prompt. The
 * planning itself lives in `lib/shot-planner` because Storyboards use it too.
 */
export async function POST(req: NextRequest) {
  try {
    // Spends AI credits — viewers must not be able to trigger it.
    const { response: authError } = await requireCreator();
    if (authError) return authError;

    const body = (await req.json()) as Body;
    const { shots, look } = await planShots({
      brief: body.brief ?? "",
      shotCount: body.shotCount,
      brandKitId: body.brandKitId,
    });
    // Campaign generates straight from this response with nowhere to persist
    // the look, so it travels inside each prompt.
    return NextResponse.json({ shots: applyContinuity(shots, look), look });
  } catch (err) {
    if (err instanceof PlannerError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const raw = err instanceof Error ? err.message : "Orchestrate failed";
    const noModel = isPlannerUnavailable(raw);
    return NextResponse.json(
      { error: noModel ? PLANNER_UNAVAILABLE_MESSAGE : raw },
      { status: noModel ? 503 : 500 }
    );
  }
}
