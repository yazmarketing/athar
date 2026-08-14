import { NextRequest, NextResponse } from "next/server";
import { isEmailAllowed, registerUser } from "@/lib/auth-users";
import { hashPassword } from "@/lib/passwords";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Public sign-up: allowed emails only, personal password (min 8 chars). */
export async function POST(req: NextRequest) {
  let body: { email?: string; name?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }
  if (!isEmailAllowed(email)) {
    return NextResponse.json(
      { error: "This email is not on the team allowlist — ask an admin to add it" },
      { status: 403 }
    );
  }

  try {
    const user = await registerUser(
      email,
      body.name ?? null,
      await hashPassword(password)
    );
    return NextResponse.json({
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-up failed";
    const conflict = message.includes("already exists");
    return NextResponse.json(
      { error: message },
      { status: conflict ? 409 : 500 }
    );
  }
}
