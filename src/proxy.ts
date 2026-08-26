import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * First line of defence: redirect signed-out browsers to /login and reject
 * unauthenticated API calls.
 *
 * This is an *optimistic* gate only. Next's own guidance is that proxy
 * "should not be used as a full session management or authorization
 * solution", so every page and route handler re-checks the session on the
 * server as well. Never let this file be the only thing standing between a
 * request and the app.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public share links: /s/<token> and its /s/<token>/image stream. Matched
  // on the exact token shape rather than a bare "/s/" prefix, so this can
  // only ever expose a share page — nothing else can be reached through it.
  if (/^\/s\/[A-Za-z0-9_-]{16,128}(\/image)?$/.test(pathname)) {
    return NextResponse.next();
  }

  // Public transcript links: /t/<token>. Same reasoning, same exact shape.
  if (/^\/t\/[A-Za-z0-9_-]{16,128}$/.test(pathname)) {
    return NextResponse.next();
  }

  // Public voice links: /v/<token> and its download endpoint. Same reasoning.
  if (
    /^\/v\/[A-Za-z0-9_-]{16,128}$/.test(pathname) ||
    /^\/api\/tts\/share\/[A-Za-z0-9_-]{16,128}\/download$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/api/register" ||
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple-icon") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logos") ||
    pathname.startsWith("/fonts")
  ) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  });

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    if (pathname !== "/") {
      login.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|favicon/|fonts/|icon$|apple-icon$).*)",
  ],
};
