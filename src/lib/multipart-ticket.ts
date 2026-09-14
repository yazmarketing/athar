import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

const TICKET_TTL_MS = 20 * 60 * 1000;

type TicketPayload = {
  u: string;
  i: string;
  p: string;
  e: number;
};

function secret(): string {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("Missing AUTH_SECRET env var");
  return value;
}

function signPayload(payload: string): Buffer {
  return createHmac("sha256", secret()).update(payload).digest();
}

function equal(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function signMultipartTicket(opts: {
  userId: string;
  uploadId: string;
  path: string;
}): string {
  const body: TicketPayload = {
    u: opts.userId,
    i: opts.uploadId,
    p: opts.path,
    e: Date.now() + TICKET_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = signPayload(payload).toString("base64url");
  return `${payload}.${sig}`;
}

export function readMultipartTicket(
  token: string,
  expected: { userId: string; uploadId: string; path: string }
): boolean {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(sig, "base64url");
  } catch {
    return false;
  }
  if (!equal(sigBuf, signPayload(payload))) return false;

  let body: TicketPayload;
  try {
    body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TicketPayload;
  } catch {
    return false;
  }
  if (
    typeof body.u !== "string" ||
    typeof body.i !== "string" ||
    typeof body.p !== "string" ||
    typeof body.e !== "number"
  ) {
    return false;
  }
  if (body.e < Date.now()) return false;
  return (
    body.u === expected.userId &&
    body.i === expected.uploadId &&
    body.p === expected.path
  );
}
