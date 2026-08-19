import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { db } from "@/lib/db";

/**
 * Whether the signed-in member has finished the walkthrough.
 *
 * Kept against the user rather than the browser: localStorage is per-device
 * and Safari clears it on a timer, which is why the tour used to reappear at
 * nearly every sign-in.
 */
async function ensureColumn() {
  await db().query(
    `alter table public.users add column if not exists onboarded_at timestamptz`
  );
}

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ensureColumn();
    const { rows } = await db().query<{ onboarded_at: string | null }>(
      `select onboarded_at from public.users where id = $1`,
      [sessionUser.id]
    );
    return NextResponse.json({ onboarded: Boolean(rows[0]?.onboarded_at) });
  } catch {
    // Never let a database hiccup trap someone in the tour forever.
    return NextResponse.json({ onboarded: true });
  }
}

/** Mark the walkthrough finished. Only completion calls this — not skipping. */
export async function POST() {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ensureColumn();
    await db().query(
      `update public.users set onboarded_at = coalesce(onboarded_at, now())
       where id = $1`,
      [sessionUser.id]
    );
    return NextResponse.json({ onboarded: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
