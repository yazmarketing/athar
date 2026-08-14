import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { createProject, listProjects } from "@/lib/projects";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const includeArchived =
      req.nextUrl.searchParams.get("archived") === "true";
    const projects = await listProjects(includeArchived);
    return NextResponse.json({ projects });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { name?: string; client?: string };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const project = await createProject(
      name,
      body.client?.trim() || null,
      sessionUser.id
    );
    return NextResponse.json({ project });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
