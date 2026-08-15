import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth-session";
import { renameClient } from "@/lib/clients";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

/** Rename a client. Any signed-in member may do this. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    let body: { name?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { error: "A name is required" },
        { status: 400 }
      );
    }

    const client = await renameClient(id, body.name);

    await logAudit({
      userId: sessionUser.id,
      userEmail: sessionUser.email,
      action: "client_rename",
      subjectType: "client",
      subjectId: id,
      meta: { name: client.name },
    });

    return NextResponse.json({ client });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Rename failed";
    const status = message.includes("already uses")
      ? 409
      : message.includes("not found")
        ? 404
        : message.includes("required") || message.includes("too long")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
