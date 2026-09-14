import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readMultipartTicket,
  signMultipartTicket,
} from "@/lib/multipart-ticket";

const KEYS = ["AUTH_SECRET", "NEXTAUTH_SECRET"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.AUTH_SECRET = "test-secret-for-multipart-tickets";
  delete process.env.NEXTAUTH_SECRET;
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const session = {
  userId: "user-1",
  uploadId: "upload-abc",
  path: "references/1-abc.mp4",
};

describe("multipart ticket", () => {
  it("accepts a ticket it just signed", () => {
    const token = signMultipartTicket(session);
    expect(readMultipartTicket(token, session)).toBe(true);
  });

  it("rejects a ticket for a different path", () => {
    const token = signMultipartTicket(session);
    expect(
      readMultipartTicket(token, { ...session, path: "references/2-xyz.mp4" })
    ).toBe(false);
  });

  it("rejects a ticket for a different user", () => {
    const token = signMultipartTicket(session);
    expect(readMultipartTicket(token, { ...session, userId: "user-2" })).toBe(
      false
    );
  });

  it("rejects a truncated token", () => {
    expect(readMultipartTicket("not-a-ticket", session)).toBe(false);
  });
});
