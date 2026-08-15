import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-session";
import { Studio } from "@/components/studio";

// Reading the session means reading cookies, so this route is always
// per-request. Declaring it stops Next attempting a static render.
export const dynamic = "force-dynamic";

/**
 * Next signals control flow by throwing: `redirect()`, `notFound()` and the
 * dynamic-rendering bailout all surface as errors carrying a `digest`.
 * Swallowing those breaks the framework, so only genuine faults are caught.
 */
function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string";
}

// The studio holds every client, project and generation in the workspace, so
// it must never render for a signed-out visitor. proxy.ts already redirects,
// but Next treats proxy as an optimistic gate rather than authorization —
// this server-side check is the one that actually guarantees it.
export default async function Home() {
  // A transient fault here (cold DB or a slow cold start right after the
  // OAuth redirect) must not 500 the whole page — degrade to the sign-in
  // screen, which is both the safe direction and recoverable for the user.
  let sessionUser = null;
  try {
    sessionUser = await getSessionUser();
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    console.error("Session lookup failed on /", err);
  }

  // Outside the try: redirect() works by throwing.
  if (!sessionUser?.id) {
    redirect("/login");
  }

  return <Studio />;
}
