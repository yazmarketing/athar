import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import {
  hasCompletedOnboarding,
  markOnboardingComplete,
} from "@/lib/auth-users";

/**
 * Onboarding state for the signed-in user. Completion is stored on the user
 * row so it survives a new browser, a private window and cleared storage —
 * the walkthrough follows the person, not the machine.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ completed: await hasCompletedOnboarding(user.id) });
  } catch {
    // The DB being unreachable must not trap someone in an endless tour, so
    // report "already done" and let the local fast path decide.
    return NextResponse.json({ completed: true, degraded: true });
  }
}

/**
 * Mark the walkthrough complete. Replaying it from the help button is purely
 * a client-side reopen, so there is deliberately no "un-complete" here.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await markOnboardingComplete(user.id);
    return NextResponse.json({ completed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
