import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { clearFeedback, setFeedback } from "@/lib/generation-feedback";

type Params = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Rating is for the person who made the thing. Someone else's opinion of your
 * render is a different feature with different rules, and mixing them would
 * make the export unreadable — "was this what you asked for?" only means
 * something asked of the person who asked for it.
 */
async function assertOwner(generationId: string, userId: string) {
  const { rows } = await db().query<{ user_id: string | null }>(
    `select user_id from generations where id = $1 and deleted_at is null`,
    [generationId]
  );
  if (rows.length === 0) return "not_found" as const;
  return rows[0].user_id === userId ? ("ok" as const) : ("forbidden" as const);
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await getSessionUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const owner = await assertOwner(id, user.id);
    if (owner === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (owner === "forbidden") {
      return NextResponse.json(
        { error: "Only the person who generated this can rate it" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      rating?: number;
      reasons?: string[];
      note?: string;
    };
    if (body.rating !== 1 && body.rating !== -1) {
      return NextResponse.json(
        { error: "rating must be 1 or -1" },
        { status: 400 }
      );
    }

    const feedback = await setFeedback({
      generationId: id,
      userId: user.id,
      rating: body.rating,
      reasons: body.reasons,
      note: body.note,
    });
    return NextResponse.json({ feedback });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Un-rate — clicking the same thumb again clears it. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await getSessionUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    await clearFeedback(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not clear";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
