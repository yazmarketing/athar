import "server-only";
import { db } from "@/lib/db";
import type { ClientRecord } from "@/lib/types";

export async function ensureClientsTable() {
  await db().query(`
    create table if not exists public.clients (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      created_by uuid references public.users (id) on delete set null,
      archived_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create unique index if not exists clients_name_lower_idx
      on public.clients (lower(name))
  `);
}

export async function listClients(
  includeArchived = false
): Promise<ClientRecord[]> {
  await ensureClientsTable();
  const { rows } = await db().query<ClientRecord>(
    `select c.*,
            count(distinct p.id)::int as project_count,
            count(distinct b.id)::int as brand_kit_count
     from clients c
     left join projects p
       on p.client_id = c.id and p.archived_at is null
     left join brand_kits b
       on b.client_id = c.id and b.archived_at is null
     where ($1::boolean or c.archived_at is null)
     group by c.id
     order by lower(c.name) asc`,
    [includeArchived]
  );
  return rows.map((r) => ({
    ...r,
    project_count: Number(r.project_count ?? 0),
    brand_kit_count: Number(r.brand_kit_count ?? 0),
  }));
}

export async function createClient(
  name: string,
  createdBy: string | null
): Promise<ClientRecord> {
  await ensureClientsTable();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Client name is required");

  // Case-insensitive uniqueness — reuse an existing client if the name matches.
  const existing = await db().query<ClientRecord>(
    `select * from clients where lower(name) = lower($1)`,
    [trimmed]
  );
  if (existing.rows[0]) return existing.rows[0];

  const { rows } = await db().query<ClientRecord>(
    `insert into clients (name, created_by) values ($1, $2) returning *`,
    [trimmed, createdBy]
  );
  if (!rows[0]) throw new Error("Could not create client");
  return { ...rows[0], project_count: 0, brand_kit_count: 0 };
}

/**
 * Rename a client. Names are case-insensitively unique, so a collision with a
 * *different* client is reported as a conflict rather than silently merging.
 */
export async function renameClient(
  id: string,
  name: string
): Promise<ClientRecord> {
  await ensureClientsTable();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Client name is required");
  if (trimmed.length > 120) throw new Error("Client name is too long");

  const clash = await db().query<{ id: string }>(
    `select id from clients where lower(name) = lower($1) and id <> $2`,
    [trimmed, id]
  );
  if (clash.rows[0]) throw new Error("Another client already uses that name");

  const { rows } = await db().query<ClientRecord>(
    `update clients set name = $2, updated_at = now()
     where id = $1 returning *`,
    [id, trimmed]
  );
  if (!rows[0]) throw new Error("Client not found");
  return rows[0];
}

export async function clientExists(id: string): Promise<boolean> {
  await ensureClientsTable();
  const { rows } = await db().query(`select id from clients where id = $1`, [
    id,
  ]);
  return Boolean(rows[0]);
}
