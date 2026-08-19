import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { requireCreator } from "@/lib/authz";
import { db } from "@/lib/db";
import { deleteStoryboard, getStoryboard } from "@/lib/storyboards";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

/** The whole board: header, bible and panels, in one read. */
export async function GET(_req: NextRequest, { params }: Params) {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const full = await getStoryboard(id);
  if (!full) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(full);
}

/** Rename a board or change its register. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireCreator();
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    register?: string;
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  if (body.title?.trim()) {
    values.push(body.title.trim().slice(0, 200));
    sets.push(`title = $${values.length}`);
  }
  if (["sketch", "line", "mono", "photoreal"].includes(body.register ?? "")) {
    values.push(body.register);
    sets.push(`register = $${values.length}`);
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  values.push(id);
  const { rows } = await db().query(
    `update storyboards set ${sets.join(", ")}, updated_at = now()
     where id = $${values.length} and deleted_at is null returning *`,
    values
  );
  if (!rows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ storyboard: rows[0] });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireCreator();
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await deleteStoryboard(id);
  return NextResponse.json({ ok: true });
}
