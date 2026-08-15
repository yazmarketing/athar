import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth-session";
import { createShare, getActiveShare, revokeShares } from "@/lib/shares";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

/** Current live share link for this generation, if any. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const share = await getActiveShare(id);
    return NextResponse.json({ token: share?.token ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Create (or reuse) a public share link. */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const share = await createShare(id, sessionUser.id);
    await logAudit({
      userId: sessionUser.id,
      userEmail: sessionUser.email,
      action: "generation_share_create",
      subjectType: "generation",
      subjectId: id,
    });
    return NextResponse.json({ token: share.token });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Share failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Revoke every live link for this generation. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const revoked = await revokeShares(id);
    await logAudit({
      userId: sessionUser.id,
      userEmail: sessionUser.email,
      action: "generation_share_revoke",
      subjectType: "generation",
      subjectId: id,
      meta: { revoked },
    });
    return NextResponse.json({ ok: true, revoked });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Revoke failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
