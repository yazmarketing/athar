"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AtharLogo } from "@/components/athar-logo";
import { YazMediaLogo } from "@/components/yaz-media-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  googleEnabled: boolean;
};

export function LoginForm({ googleEnabled }: Props) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function signInWithCredentials() {
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });
    if (res?.error) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }
    window.location.href = res?.url ?? callbackUrl;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (mode === "register") {
      try {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name: name.trim() || null, password }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Sign-up failed");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign-up failed");
        setLoading(false);
        return;
      }
    }

    await signInWithCredentials();
  }

  const header = (
    <div className="mb-8 flex flex-col items-center text-center">
      <div className="flex items-center gap-4">
        <AtharLogo variant="stacked" height={104} priority />
        <span className="h-14 w-px bg-border/70" aria-hidden />
        <a
          href="https://yazmedia.com"
          target="_blank"
          rel="noreferrer"
          aria-label="by YAZ Media"
          className="flex items-center gap-2 opacity-50 transition hover:opacity-90"
        >
          <span className="text-[0.6rem] uppercase tracking-[0.24em] text-muted-foreground">
            by
          </span>
          <YazMediaLogo height={30} />
        </a>
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        {mode === "signin" ? "Sign in" : "Create your account"}
      </p>
    </div>
  );

  if (!mounted) {
    return (
      <div className="w-full max-w-sm">
        {header}
        <div className="space-y-3" aria-hidden>
          <div className="h-10 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-10 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-10 animate-pulse rounded-lg bg-foreground/15" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      {header}

      {googleEnabled && (
        <>
          <Button
            type="button"
            className="athar-label h-11 w-full gap-2 bg-gold text-primary-foreground hover:bg-gold/90"
            disabled={loading}
            onClick={() => signIn("google", { callbackUrl })}
          >
            Continue with Google
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Use your <span className="text-foreground">@yazmedia.com</span>{" "}
            Google account.
          </p>
        </>
      )}

      {/* Email / password is a fallback for local dev only — hidden once
          Google SSO is configured, so the team signs in with Google alone. */}
      {!googleEnabled && (
        <>
      <form onSubmit={onSubmit} className="space-y-3" suppressHydrationWarning>
        {mode === "register" && (
          <Input
            type="text"
            autoComplete="name"
            placeholder="Your name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 bg-card"
          />
        )}
        <Input
          type="email"
          autoComplete="email"
          placeholder="Work email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-10 bg-card"
        />
        <Input
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder={
            mode === "signin" ? "Password" : "Choose a password (min 8 chars)"
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === "register" ? 8 : undefined}
          className="h-10 bg-card"
        />
        {error && (
          <p className="text-center text-xs text-foreground">{error}</p>
        )}
        <Button
          type="submit"
          disabled={loading}
          className="athar-label h-10 w-full bg-gold text-primary-foreground hover:bg-gold/90"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {mode === "signin" ? "Signing in…" : "Creating account…"}
            </>
          ) : mode === "signin" ? (
            "Sign in"
          ) : (
            "Create account"
          )}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === "signin" ? "register" : "signin"));
          setError("");
        }}
        className={cn(
          "mt-4 w-full text-center text-xs text-muted-foreground transition hover:text-foreground"
        )}
      >
        {mode === "signin"
          ? "New here? Create an account"
          : "Already have an account? Sign in"}
      </button>
        </>
      )}
    </div>
  );
}
