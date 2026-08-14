import "server-only";
import { db } from "@/lib/db";
import type { BrandKitRecord } from "@/lib/types";

export async function ensureBrandKitsTable() {
  await db().query(`
    create table if not exists public.brand_kits (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      client text,
      brand_tokens text not null default '',
      negative_additions text not null default '',
      reference_urls text[] not null default '{}',
      project_id uuid references public.projects (id) on delete set null,
      created_by uuid references public.users (id) on delete set null,
      archived_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create index if not exists brand_kits_created_at_idx
      on public.brand_kits (created_at desc)
  `);
}

export async function listBrandKits(
  includeArchived = false
): Promise<BrandKitRecord[]> {
  await ensureBrandKitsTable();
  const { rows } = await db().query<BrandKitRecord>(
    `select * from brand_kits
     where ($1::boolean or archived_at is null)
     order by created_at desc`,
    [includeArchived]
  );
  return rows;
}

export async function getBrandKit(id: string): Promise<BrandKitRecord | null> {
  await ensureBrandKitsTable();
  const { rows } = await db().query<BrandKitRecord>(
    `select * from brand_kits where id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createBrandKit(input: {
  name: string;
  client?: string | null;
  brandTokens?: string;
  negativeAdditions?: string;
  referenceUrls?: string[];
  projectId?: string | null;
  createdBy?: string | null;
}): Promise<BrandKitRecord> {
  await ensureBrandKitsTable();
  const name = input.name.trim();
  if (!name) throw new Error("Brand kit name is required");

  const { rows } = await db().query<BrandKitRecord>(
    `insert into brand_kits
       (name, client, brand_tokens, negative_additions, reference_urls,
        project_id, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [
      name,
      input.client?.trim() || null,
      input.brandTokens?.trim() ?? "",
      input.negativeAdditions?.trim() ?? "",
      input.referenceUrls ?? [],
      input.projectId ?? null,
      input.createdBy ?? null,
    ]
  );
  if (!rows[0]) throw new Error("Could not create brand kit");
  return rows[0];
}

export async function updateBrandKit(
  id: string,
  patch: {
    name?: string;
    client?: string | null;
    brandTokens?: string;
    negativeAdditions?: string;
    referenceUrls?: string[];
    projectId?: string | null;
    archived?: boolean;
  }
): Promise<BrandKitRecord | null> {
  await ensureBrandKitsTable();
  const sets: string[] = ["updated_at = now()"];
  const values: unknown[] = [];
  let i = 1;

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Brand kit name is required");
    sets.push(`name = $${i++}`);
    values.push(trimmed);
  }
  if (patch.client !== undefined) {
    sets.push(`client = $${i++}`);
    values.push(patch.client?.trim() || null);
  }
  if (patch.brandTokens !== undefined) {
    sets.push(`brand_tokens = $${i++}`);
    values.push(patch.brandTokens.trim());
  }
  if (patch.negativeAdditions !== undefined) {
    sets.push(`negative_additions = $${i++}`);
    values.push(patch.negativeAdditions.trim());
  }
  if (patch.referenceUrls !== undefined) {
    sets.push(`reference_urls = $${i++}`);
    values.push(patch.referenceUrls);
  }
  if (patch.projectId !== undefined) {
    sets.push(`project_id = $${i++}`);
    values.push(patch.projectId);
  }
  if (patch.archived !== undefined) {
    sets.push(`archived_at = $${i++}`);
    values.push(patch.archived ? new Date().toISOString() : null);
  }

  if (sets.length === 1) return getBrandKit(id);

  values.push(id);
  const { rows } = await db().query<BrandKitRecord>(
    `update brand_kits set ${sets.join(", ")} where id = $${i} returning *`,
    values
  );
  return rows[0] ?? null;
}
