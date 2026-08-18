import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { deleteFrame, updateFrame, type FramePatch } from "@/lib/storyboards";

type Params = { params: Promise<{ id: string; frameId: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const { id, frameId } = await params;
    if (!UUID_RE.test(id) || !UUID_RE.test(frameId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = (await req.json()) as FramePatch;
    const frame = await updateFrame(id, frameId, body);
    if (!frame) {
      return NextResponse.json(
        { error: "Frame not found, or nothing to update" },
        { status: 404 }
      );
    }
    return NextResponse.json({ frame });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const { id, frameId } = await params;
    if (!UUID_RE.test(id) || !UUID_RE.test(frameId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    await deleteFrame(id, frameId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
