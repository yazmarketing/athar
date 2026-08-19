import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import {
  isPlannerUnavailable,
  PLANNER_UNAVAILABLE_MESSAGE,
  PlannerError,
  planShots,
} from "@/lib/shot-planner";
import { continuityBrief } from "@/lib/shot-plan";
import { describeReferences } from "@/lib/reference-assets";
import {
  addFrame,
  getStoryboard,
  replaceFrames,
  updateStoryboard,
  type FramePatch,
} from "@/lib/storyboards";

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Default screen time per frame, in seconds — matches the video default. */
const DEFAULT_FRAME_SECONDS = 5;

/**
 * Break the board's brief into frames.
 *
 * `mode: "replace"` (the default) rewrites the board — the natural meaning of
 * re-planning. `mode: "append"` adds frames to what's already there and reuses
 * the look already locked on the board, so extra frames match the existing
 * ones instead of inventing a new world.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    // Spends AI credits — viewers must not be able to trigger it.
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const board = await getStoryboard(id);
    if (!board) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      brief?: string;
      shotCount?: number;
      mode?: "replace" | "append";
    };
    const brief = (body.brief ?? board.brief ?? "").trim();
    if (!brief) {
      return NextResponse.json(
        { error: "Write a brief first — that's what gets broken into frames" },
        { status: 400 }
      );
    }
    const append = body.mode === "append";

    // Attached references bind the shots to a real character/product/look, and
    // appending must not re-invent the world the board already established.
    const direction = [
      await describeReferences(board.reference_urls ?? []),
      append ? continuityBrief(board.look) : "",
    ]
      .filter(Boolean)
      .join(" ");

    // An approved look and cast are settled facts, not suggestions — without
    // this, re-planning re-rolls the wardrobe and a correct kandura becomes a
    // cotton shirt on the next pass.
    const locked = board.look_locked;

    const { shots, look, cast, banned } = await planShots({
      brief,
      shotCount: body.shotCount,
      brandKitId: board.brand_kit_id,
      aspect: board.aspect,
      extraDirection: direction,
      lockedLook: locked ? board.look : null,
      lockedCast: locked ? board.cast_members : null,
    });

    const patches: FramePatch[] = shots.map((shot) => ({
      title: shot.title,
      prompt: shot.prompt,
      motion: shot.motion ?? "",
      shot_size: shot.shotSize ?? "",
      aspect: shot.aspect,
      duration_s: DEFAULT_FRAME_SECONDS,
      is_blank: shot.isBlank ?? false,
      cast_ids: shot.cast,
      // A frame with nobody in it has no identity to inherit, so nothing to
      // anchor to either.
      lock_to_anchor: shot.cast.length > 0,
    }));

    if (append) {
      for (const patch of patches) await addFrame(id, patch);
    } else {
      await replaceFrames(id, patches);
    }

    // Persist the brief that was actually planned from, and the look — both
    // are what later frames and regenerations have to stay consistent with.
    // Appending keeps the original look rather than overwriting it.
    await updateStoryboard(id, {
      brief,
      ...(append || !look ? {} : { look }),
      ...(append || cast.length === 0 ? {} : { cast }),
      ...(append || banned.length === 0 ? {} : { bannedElements: banned }),
    });

    const storyboard = await getStoryboard(id);
    return NextResponse.json({ storyboard });
  } catch (err) {
    if (err instanceof PlannerError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const raw = err instanceof Error ? err.message : "Planning failed";
    const noModel = isPlannerUnavailable(raw);
    return NextResponse.json(
      { error: noModel ? PLANNER_UNAVAILABLE_MESSAGE : raw },
      { status: noModel ? 503 : 500 }
    );
  }
}
