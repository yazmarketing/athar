import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  const googleEnabled =
    Boolean(process.env.GOOGLE_CLIENT_ID?.trim()) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim());

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <LoginForm googleEnabled={googleEnabled} />
      </Suspense>
    </div>
  );
}
