import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { createTranscriptShare, revokeTranscriptShare } from "@/lib/transcripts";

type Params = { params: Promise<{ id: string }> };

/** A read-only link for someone without a studio login. */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const { id } = await params;

    const token = await createTranscriptShare(id, auth.user.id);
    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "transcript.share",
      subjectType: "transcript",
      subjectId: id,
    });
    return NextResponse.json({ token, path: `/t/${token}` });
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
    await revokeTranscriptShare(token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Revoke failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
