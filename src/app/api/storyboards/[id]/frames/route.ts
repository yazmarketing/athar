import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { addFrame, reorderFrames, type FramePatch } from "@/lib/storyboards";

type Params = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Append a frame to the end of the board. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as FramePatch;
    const frame = await addFrame(id, body);
    return NextResponse.json({ frame });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Add failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Rewrite the running order: `{ order: [frameId, …] }`. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = (await req.json()) as { order?: unknown };
    if (!Array.isArray(body.order)) {
      return NextResponse.json(
        { error: "order must be an array of frame ids" },
        { status: 400 }
      );
    }

    const frames = await reorderFrames(
      id,
      body.order.filter((v): v is string => typeof v === "string")
    );
    return NextResponse.json({ frames });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reorder failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
