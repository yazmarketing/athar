import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
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
    secret: process.env.AUTH_SECRET,
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
