import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { patchTtsDirectorSegment, type TtsDirectorSegmentPatch } from "@/lib/tts-director";

type Params = { params: Promise<{ id: string }> };

/** Manual override of any segment field after any pass — e.g. an edited phonetic span. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const { id } = await params;

    const body = (await req.json()) as TtsDirectorSegmentPatch;
    const segment = await patchTtsDirectorSegment(id, body);
    if (!segment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ segment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
