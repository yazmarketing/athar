import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { db } from "@/lib/db";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projectId = req.nextUrl.searchParams.get("projectId");
    if (projectId && !UUID_RE.test(projectId)) {
      return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
    }
    const mineOnly = req.nextUrl.searchParams.get("createdBy") === "me";

    const where: string[] = ["deleted_at is null"];
    const values: unknown[] = [];
    if (projectId) {
      values.push(projectId);
      where.push(`project_id = $${values.length}`);
    }
    if (mineOnly) {
      values.push(sessionUser.id);
      where.push(`user_id = $${values.length}`);
    }

    const { rows } = await db().query(
      `select * from generations
       ${where.length ? `where ${where.join(" and ")}` : ""}
       order by is_favorite desc, created_at desc
       limit 120`,
      values
    );

    return NextResponse.json({ generations: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
