import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { requireAdmin, requireCreator } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { deleteTtsGeneration, getTtsGeneration, updateTtsGeneration } from "@/lib/tts";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const generation = await getTtsGeneration(id);
    if (!generation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ generation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const { id } = await params;

    const body = (await req.json()) as {
      title?: string;
      clientId?: string | null;
      projectId?: string | null;
      archived?: boolean;
    };

    const generation = await updateTtsGeneration(id, body);
    if (!generation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ generation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;
    const { id } = await params;

    await deleteTtsGeneration(id);
    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "tts.delete",
      subjectType: "tts_generation",
      subjectId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
