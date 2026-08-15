import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isEmailAllowed } from "@/lib/auth-users";

const KEYS = ["AUTH_ALLOWED_DOMAINS", "AUTH_ALLOWED_EMAILS"] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllEnvs();
});

function setAllowlist(domains?: string, emails?: string) {
  if (domains === undefined) delete process.env.AUTH_ALLOWED_DOMAINS;
  else process.env.AUTH_ALLOWED_DOMAINS = domains;
  if (emails === undefined) delete process.env.AUTH_ALLOWED_EMAILS;
  else process.env.AUTH_ALLOWED_EMAILS = emails;
}

describe("isEmailAllowed", () => {
  it("allows an address on an allowed domain", () => {
    setAllowlist("yazmedia.com");
    expect(isEmailAllowed("someone@yazmedia.com")).toBe(true);
    expect(isEmailAllowed("  SomeOne@YazMedia.com  ")).toBe(true);
  });

  it("rejects an address outside the allowed domain", () => {
    setAllowlist("yazmedia.com");
    expect(isEmailAllowed("attacker@gmail.com")).toBe(false);
  });

  it("does not treat the domain as a suffix match", () => {
    setAllowlist("yazmedia.com");
    expect(isEmailAllowed("attacker@notyazmedia.com")).toBe(false);
    expect(isEmailAllowed("attacker@yazmedia.com.evil.tld")).toBe(false);
  });

  it("allows a specifically listed address", () => {
    setAllowlist(undefined, "contractor@outside.com");
    expect(isEmailAllowed("contractor@outside.com")).toBe(true);
    expect(isEmailAllowed("someone.else@outside.com")).toBe(false);
  });

  // Regression: an unconfigured allowlist used to return true in development,
  // which let ANY email sign in or self-register. It must fail closed instead.
  it("fails closed when no allowlist is configured", () => {
    setAllowlist(undefined, undefined);
    expect(isEmailAllowed("anyone@anywhere.com")).toBe(false);
  });

  it("fails closed with no allowlist even in development", () => {
    setAllowlist(undefined, undefined);
    vi.stubEnv("NODE_ENV", "development");
    expect(isEmailAllowed("anyone@anywhere.com")).toBe(false);
  });

  it("fails closed on empty/whitespace allowlist values", () => {
    setAllowlist(" , ", "  ");
    expect(isEmailAllowed("anyone@anywhere.com")).toBe(false);
  });
});
