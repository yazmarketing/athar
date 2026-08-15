import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cap per request so one call can never soft-delete the whole library. */
const MAX_IDS = 200;

/**
 * Admin-only bulk soft-delete of generations (Library multi-select).
 *
 * Soft-delete matches the single-item DELETE: rows stay so usage/cost
 * aggregates are never affected, they are just hidden from the Library.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireAdmin();
    if (response) return response;

    let body: { ids?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!Array.isArray(body.ids)) {
      return NextResponse.json(
        { error: "Expected an `ids` array" },
        { status: 400 }
      );
    }

    // De-duplicate before validating so a repeated id can't inflate the count.
    const ids = [...new Set(body.ids)];

    if (ids.length === 0) {
      return NextResponse.json({ error: "No ids provided" }, { status: 400 });
    }
    if (ids.length > MAX_IDS) {
      return NextResponse.json(
        { error: `Too many ids — delete at most ${MAX_IDS} at a time` },
        { status: 400 }
      );
    }
    if (!ids.every((id): id is string => typeof id === "string" && UUID_RE.test(id))) {
      return NextResponse.json(
        { error: "Every id must be a valid uuid" },
        { status: 400 }
      );
    }

    // Single parameterised statement — ids are bound, never interpolated.
    const { rows } = await db().query<{ id: string }>(
      `update generations set deleted_at = now()
       where id = any($1::uuid[]) and deleted_at is null
       returning id`,
      [ids]
    );

    const deletedIds = rows.map((r) => r.id);

    if (deletedIds.length > 0) {
      await logAudit({
        userId: user.id,
        userEmail: user.email,
        action: "generation_bulk_delete",
        subjectType: "generation",
        subjectId: null,
        meta: {
          count: deletedIds.length,
          requested: ids.length,
          ids: deletedIds,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      deleted: deletedIds.length,
      requested: ids.length,
      ids: deletedIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bulk delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
