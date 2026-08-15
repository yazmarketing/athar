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
