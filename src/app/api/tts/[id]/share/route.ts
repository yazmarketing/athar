import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { createTtsShare, revokeTtsShare } from "@/lib/tts";

type Params = { params: Promise<{ id: string }> };

/** A read-only link for someone without a studio login. */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const { id } = await params;

    const token = await createTtsShare(id, auth.user.id);
    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "tts.share",
      subjectType: "tts_generation",
      subjectId: id,
    });
    return NextResponse.json({ token, path: `/v/${token}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Share failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    await params;

    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }
    await revokeTtsShare(token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Revoke failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
