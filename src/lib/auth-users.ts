import "server-only";
import { db } from "@/lib/db";

export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "creator" | "viewer";
  team?: string | null;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isEmailAllowed(email: string): boolean {
  const normalized = normalizeEmail(email);
  const domains = (process.env.AUTH_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const emails = (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (domains.length > 0) {
    const domain = normalized.split("@")[1];
    if (domain && domains.includes(domain)) return true;
  }
  if (emails.length > 0 && emails.includes(normalized)) return true;

  // Dev fallback when allowlist not configured
  if (
    process.env.NODE_ENV === "development" &&
    domains.length === 0 &&
    emails.length === 0
  ) {
    return true;
  }

  return false;
}

async function ensureUsersTable() {
  await db().query(`
    create table if not exists public.users (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      name text,
      role text not null default 'creator'
        check (role in ('admin', 'creator', 'viewer')),
      active boolean not null default true,
      password_hash text,
      created_at timestamptz not null default now(),
      last_login_at timestamptz
    )
  `);
  await db().query(`
    alter table public.users add column if not exists password_hash text
  `);
  await db().query(`
    create index if not exists users_email_idx on public.users (email)
  `);
}

export type UserAuthRecord = AppUser & {
  active: boolean;
  password_hash: string | null;
};

/** Fetch a user with their password hash for credential checks. */
export async function getUserAuthByEmail(
  email: string
): Promise<UserAuthRecord | null> {
  await ensureUsersTable();
  const { rows } = await db().query<UserAuthRecord>(
    `select id, email, name, role, active, password_hash
     from public.users where email = $1`,
    [normalizeEmail(email)]
  );
  return rows[0] ?? null;
}

/**
 * Create an account with a personal password. If the email already signed in
 * before with the shared password (no personal password yet), it claims that
 * account instead of failing.
 */
export async function registerUser(
  email: string,
  name: string | null,
  passwordHash: string
): Promise<AppUser> {
  await ensureUsersTable();
  const normalized = normalizeEmail(email);
  const adminEmail = process.env.AUTH_ADMIN_EMAIL?.trim().toLowerCase();

  const existing = await getUserAuthByEmail(normalized);
  if (existing?.password_hash) {
    throw new Error("An account with this email already exists — sign in instead");
  }
  if (existing) {
    if (!existing.active) throw new Error("Account is disabled");
    const { rows } = await db().query<AppUser>(
      `update public.users
       set password_hash = $2, name = coalesce($3, name)
       where id = $1
       returning id, email, name, role`,
      [existing.id, passwordHash, name?.trim() || null]
    );
    return rows[0];
  }

  const { rows } = await db().query<AppUser>(
    `insert into public.users (email, name, role, password_hash)
     values ($1, $2, $3, $4)
     returning id, email, name, role`,
    [
      normalized,
      name?.trim() || null,
      adminEmail && normalized === adminEmail ? "admin" : "creator",
      passwordHash,
    ]
  );
  return rows[0];
}

/** Upsert user on sign-in; returns DB row id for session stamping. */
export async function upsertUser(
  email: string,
  name?: string | null,
  team?: string | null
): Promise<AppUser> {
  await ensureUsersTable();
  await db().query(`alter table public.users add column if not exists team text`);
  const normalized = normalizeEmail(email);
  const adminEmail = process.env.AUTH_ADMIN_EMAIL?.trim().toLowerCase();
  const pool = db();

  const { rows } = await pool.query<AppUser>(
    `insert into public.users (email, name, role, team, last_login_at)
     values ($1, $2, $3, $4, now())
     on conflict (email) do update set
       name = coalesce(excluded.name, users.name),
       team = coalesce(excluded.team, users.team),
       -- Promote the configured admin email on sign-in (never demote others)
       role = case when excluded.role = 'admin' then 'admin' else users.role end,
       last_login_at = now()
     returning id, email, name, role, team`,
    [
      normalized,
      name?.trim() || null,
      adminEmail && normalized === adminEmail ? "admin" : "creator",
      team?.trim() || null,
    ]
  );

  const user = rows[0];
  if (!user) throw new Error("Could not upsert user");

  const activeRow = await pool.query<{ active: boolean }>(
    `select active from public.users where id = $1`,
    [user.id]
  );
  if (activeRow.rows[0]?.active === false) {
    throw new Error("Account is disabled");
  }

  return user;
}
