import "server-only";
import { db, onceProcess } from "@/lib/db";
import type { StylePresetRecord } from "@/lib/types";

async function ensureStylePresetsTableUncached() {
  await db().query(`
    create table if not exists public.style_presets (
      id uuid primary key default gen_random_uuid(),
      client_id uuid references public.clients (id) on delete cascade,
      name text not null,
      positive text not null default '',
      negative text not null default '',
      created_by uuid references public.users (id) on delete set null,
      archived_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

/** Memoised per process — see `onceProcess`. */
export const ensureStylePresetsTable = onceProcess(ensureStylePresetsTableUncached);

export async function listStylePresets(
  clientId?: string | null
): Promise<StylePresetRecord[]> {
  await ensureStylePresetsTable();
  const { rows } = await db().query<StylePresetRecord>(
    `select * from style_presets
     where archived_at is null
       and ($1::uuid is null or client_id = $1::uuid)
     order by lower(name) asc`,
    [clientId ?? null]
  );
  return rows;
}

export async function createStylePreset(input: {
  name: string;
  positive: string;
  negative?: string;
  clientId?: string | null;
  createdBy?: string | null;
}): Promise<StylePresetRecord> {
  await ensureStylePresetsTable();
  const name = input.name.trim();
  if (!name) throw new Error("Preset name is required");
  if (!input.positive.trim()) throw new Error("Style tokens are required");
  const { rows } = await db().query<StylePresetRecord>(
    `insert into style_presets (client_id, name, positive, negative, created_by)
     values ($1, $2, $3, $4, $5) returning *`,
    [
      input.clientId ?? null,
      name,
      input.positive.trim(),
      input.negative?.trim() ?? "",
      input.createdBy ?? null,
    ]
  );
  if (!rows[0]) throw new Error("Could not create preset");
  return rows[0];
}

export async function archiveStylePreset(id: string): Promise<void> {
  await ensureStylePresetsTable();
  await db().query(
    `update style_presets set archived_at = now(), updated_at = now()
     where id = $1`,
    [id]
  );
}
