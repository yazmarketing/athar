import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { updatePhoneticEntryStatus } from "@/lib/tts-phonetics";
import type { TtsPhoneticEntry } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** Promote an llm_suggested mapping to active, or reject it. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const { id } = await params;

    const body = (await req.json()) as { status?: TtsPhoneticEntry["status"] };
    if (!body.status || !["active", "pending_review", "rejected"].includes(body.status)) {
      return NextResponse.json({ error: "A valid status is required" }, { status: 400 });
    }

    const entry = await updatePhoneticEntryStatus(id, body.status);
    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
