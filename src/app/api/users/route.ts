import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const ROLES = new Set(["admin", "creator", "viewer"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireAdmin() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (sessionUser.role !== "admin") {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      ),
    };
  }
  return { user: sessionUser, response: null };
}

/** List team members (admin only). */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  await db().query(`alter table public.users add column if not exists team text`);
  const { rows } = await db().query(
    `select id, email, name, role, team, active, created_at, last_login_at
     from public.users
     order by created_at asc`
  );
  return NextResponse.json({ users: rows });
}

/** Change a member's role or active flag (admin only). */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const admin = auth.user!;

  let body: {
    userId?: string;
    role?: string;
    active?: boolean;
    team?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.userId || !UUID_RE.test(body.userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }
  if (body.role !== undefined && !ROLES.has(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (body.userId === admin.id && (body.role !== undefined || body.active === false)) {
    return NextResponse.json(
      { error: "You cannot change your own role or disable yourself" },
      { status: 400 }
    );
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  if (body.role !== undefined) {
    values.push(body.role);
    sets.push(`role = $${values.length}`);
  }
  if (body.active !== undefined) {
    values.push(body.active);
    sets.push(`active = $${values.length}`);
  }
  if (body.team !== undefined) {
    values.push(body.team?.trim() || null);
    sets.push(`team = $${values.length}`);
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  values.push(body.userId);

  const { rows } = await db().query(
    `update public.users set ${sets.join(", ")}
     where id = $${values.length}
     returning id, email, name, role, team, active, created_at, last_login_at`,
    values
  );
  if (!rows[0]) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await logAudit({
    userId: admin.id,
    userEmail: admin.email,
    action: "user_update",
    subjectType: "user",
    subjectId: body.userId,
    meta: { role: body.role, active: body.active },
  });

  return NextResponse.json({ user: rows[0] });
}
