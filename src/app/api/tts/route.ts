import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { listTtsGenerations } from "@/lib/tts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** "mine" or a specific teammate's user id — same owner filter as generations. */
function resolveOwnerParam(
  owner: string | null,
  sessionUserId: string
): string | null {
  if (owner === "mine") return sessionUserId;
  if (owner && UUID_RE.test(owner)) return owner;
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const params = req.nextUrl.searchParams;
    const generations = await listTtsGenerations({
      clientId: params.get("clientId"),
      projectId: params.get("projectId"),
      createdBy: resolveOwnerParam(params.get("owner"), sessionUser.id),
      groupId: params.get("groupId"),
      includeArchived: params.get("archived") === "true",
      limit: Number(params.get("limit")) || undefined,
    });
    return NextResponse.json({ generations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
