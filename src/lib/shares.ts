import "server-only";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import type { GenerationRecord } from "@/lib/types";

export type ShareRecord = {
  token: string;
  generation_id: string;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
};

let ensured = false;

async function ensureSharesTable() {
  if (ensured) return;
  await db().query(`
    create table if not exists public.generation_shares (
      token text primary key,
      generation_id uuid not null
        references public.generations (id) on delete cascade,
      created_by uuid references public.users (id) on delete set null,
      created_at timestamptz not null default now(),
      revoked_at timestamptz
    )
  `);
  await db().query(`
    create index if not exists generation_shares_generation_idx
      on public.generation_shares (generation_id)
      where revoked_at is null
  `);
  ensured = true;
}

/**
 * 32 url-safe chars from 24 random bytes — ~192 bits. Not enumerable, and
 * safe to paste into a chat window.
 */
function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** The live share for a generation, or null. */
export async function getActiveShare(
  generationId: string
): Promise<ShareRecord | null> {
  await ensureSharesTable();
  const { rows } = await db().query<ShareRecord>(
    `select * from public.generation_shares
     where generation_id = $1 and revoked_at is null
     order by created_at desc limit 1`,
    [generationId]
  );
  return rows[0] ?? null;
}

/** Reuse the live share if there is one, otherwise mint a fresh token. */
export async function createShare(
  generationId: string,
  createdBy: string | null
): Promise<ShareRecord> {
  const existing = await getActiveShare(generationId);
  if (existing) return existing;

  const { rows } = await db().query<ShareRecord>(
    `insert into public.generation_shares (token, generation_id, created_by)
     values ($1, $2, $3) returning *`,
    [newToken(), generationId, createdBy]
  );
  if (!rows[0]) throw new Error("Could not create share link");
  return rows[0];
}

/** Take every live link for this generation offline. */
export async function revokeShares(generationId: string): Promise<number> {
  await ensureSharesTable();
  const { rowCount } = await db().query(
    `update public.generation_shares set revoked_at = now()
     where generation_id = $1 and revoked_at is null`,
    [generationId]
  );
  return rowCount ?? 0;
}

/**
 * Resolve a token to its generation. Returns null when the token is unknown,
 * revoked, or the generation has since been deleted — the public page treats
 * all three identically so a revoked link can't be distinguished from a
 * made-up one.
 */
export async function resolveShare(
  token: string
): Promise<GenerationRecord | null> {
  await ensureSharesTable();
  const { rows } = await db().query<GenerationRecord>(
    `select g.*
     from public.generation_shares s
     join public.generations g on g.id = s.generation_id
     where s.token = $1
       and s.revoked_at is null
       and g.deleted_at is null`,
    [token]
  );
  return rows[0] ?? null;
}
