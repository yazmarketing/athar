import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCb);

/** Hash a password with scrypt (Node built-in — no extra dependency). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [scheme, salt, hex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
}
