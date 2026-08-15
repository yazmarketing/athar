import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";

type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

/** Viewers can browse but cannot run costly jobs (spec §02). */
export function canGenerate(role: string | undefined) {
  return role === "admin" || role === "creator";
}

/**
 * Resolve the session user and require generation rights.
 * Returns either `{ user }` or `{ response }` ready to send back.
 */
export async function requireCreator(): Promise<
  { user: SessionUser; response?: never } | { user?: never; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user?.id) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!canGenerate(user.role)) {
    return {
      response: NextResponse.json(
        { error: "Viewers cannot run generation jobs — ask an admin for creator access" },
        { status: 403 }
      ),
    };
  }
  return { user };
}

/**
 * Resolve the session user and require the admin role. Use for destructive or
 * account-level operations (bulk delete, user management).
 */
export async function requireAdmin(): Promise<
  { user: SessionUser; response?: never } | { user?: never; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user?.id) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "admin") {
    return {
      response: NextResponse.json(
        { error: "Admins only" },
        { status: 403 }
      ),
    };
  }
  return { user };
}
