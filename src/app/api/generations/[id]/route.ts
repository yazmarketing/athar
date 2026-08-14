import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ensureFavoriteColumn } from "@/lib/generations-store";
import { projectExists } from "@/lib/projects";

const QC_STATUSES = ["pass", "revise", "reject"] as const;

type Params = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(id: string) {
  return UUID_RE.test(id);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = (await req.json()) as {
      is_favorite?: boolean;
      project_id?: string | null;
      qc_status?: string | null;
      client_ready?: boolean;
    };

    const hasFavorite = typeof body.is_favorite === "boolean";
    const hasProject = body.project_id !== undefined;
    const hasQc = body.qc_status !== undefined;
    const hasClientReady = typeof body.client_ready === "boolean";

    if (!hasFavorite && !hasProject && !hasQc && !hasClientReady) {
      return NextResponse.json(
        { error: "No supported fields to update" },
        { status: 400 }
      );
    }

    if (
      hasQc &&
      body.qc_status !== null &&
      !QC_STATUSES.includes(body.qc_status as (typeof QC_STATUSES)[number])
    ) {
      return NextResponse.json(
        { error: "qc_status must be pass, revise, reject, or null" },
        { status: 400 }
      );
    }

    if (hasProject && body.project_id !== null) {
      const pid = body.project_id as string;
      if (!isUuid(pid)) {
        return NextResponse.json({ error: "Invalid project_id" }, { status: 400 });
      }
      if (!(await projectExists(pid))) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
    }

    await ensureFavoriteColumn();

    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (hasFavorite) {
      sets.push(`is_favorite = $${i++}`);
      values.push(body.is_favorite);
    }
    if (hasProject) {
      sets.push(`project_id = $${i++}`);
      values.push(body.project_id);
    }
    if (hasQc) {
      sets.push(`qc_status = $${i++}`);
      values.push(body.qc_status);
      sets.push(`approved_by = $${i++}`);
      values.push(body.qc_status === "pass" ? sessionUser.id : null);
    }
    if (hasClientReady) {
      sets.push(`client_ready = $${i++}`);
      values.push(body.client_ready);
    }

    values.push(id);
    const { rows } = await db().query(
      `update generations
       set ${sets.join(", ")}
       where id = $${i}
       returning *`,
      values
    );

    if (!rows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (hasQc || hasClientReady) {
      await logAudit({
        userId: sessionUser.id,
        userEmail: sessionUser.email,
        action: hasQc ? "qc_status_change" : "client_ready_change",
        subjectType: "generation",
        subjectId: id,
        meta: {
          qc_status: hasQc ? body.qc_status : undefined,
          client_ready: hasClientReady ? body.client_ready : undefined,
        },
      });
    }

    return NextResponse.json({ generation: rows[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { rows } = await db().query(
      `delete from generations where id = $1 returning id`,
      [id]
    );

    if (!rows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await logAudit({
      userId: sessionUser.id,
      userEmail: sessionUser.email,
      action: "generation_delete",
      subjectType: "generation",
      subjectId: id,
    });

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
