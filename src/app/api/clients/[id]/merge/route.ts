import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth-session";
import { mergeClients } from "@/lib/entity-merges";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const body = (await req.json()) as { targetId?: unknown };
    if (!UUID_RE.test(id) || typeof body.targetId !== "string" || !UUID_RE.test(body.targetId)) {
      return NextResponse.json({ error: "Valid source and destination clients are required" }, { status: 400 });
    }
    const result = await mergeClients(id, body.targetId);
    await logAudit({
      userId: sessionUser.id,
      userEmail: sessionUser.email,
      action: "client_merge",
      subjectType: "client",
      subjectId: body.targetId,
      meta: { sourceId: id, sourceName: result.source.name, targetName: result.target.name, moved: result.summary.moved },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Merge failed";
    const status = message.includes("not found") ? 404 : message.includes("different") || message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
