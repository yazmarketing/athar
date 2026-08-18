import "server-only";
import { db } from "@/lib/db";
import type { ReferenceAssetRecord } from "@/lib/types";

export type ReferenceKind =
  | "character"
  | "product"
  | "brand"
  | "style"
  | "reference";

const KINDS: ReferenceKind[] = [
  "character",
  "product",
  "brand",
  "style",
  "reference",
];

export async function ensureReferenceAssetsTable() {
  await db().query(`
    create table if not exists public.reference_assets (
      id uuid primary key default gen_random_uuid(),
      client_id uuid references public.clients (id) on delete cascade,
      project_id uuid references public.projects (id) on delete set null,
      name text not null,
      kind text not null default 'reference'
        check (kind in ('character','product','brand','style','reference')),
      url text not null,
      notes text not null default '',
      version integer not null default 1,
      parent_id uuid references public.reference_assets (id) on delete set null,
      created_by uuid references public.users (id) on delete set null,
      archived_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create index if not exists reference_assets_client_idx
      on public.reference_assets (client_id, archived_at)
  `);
}

/** Current (non-archived) references, optionally scoped by client and kind. */
export async function listReferenceAssets(opts: {
  clientId?: string | null;
  kind?: ReferenceKind | null;
  projectId?: string | null;
} = {}): Promise<ReferenceAssetRecord[]> {
  await ensureReferenceAssetsTable();
  const { rows } = await db().query<ReferenceAssetRecord>(
    `select * from reference_assets
     where archived_at is null
       and ($1::uuid is null or client_id = $1::uuid)
       and ($2::text is null or kind = $2::text)
       and ($3::uuid is null or project_id = $3::uuid)
     order by lower(name) asc, version desc`,
    [opts.clientId ?? null, opts.kind ?? null, opts.projectId ?? null]
  );
  return rows;
}

export async function createReferenceAsset(input: {
  name: string;
  url: string;
  kind?: ReferenceKind;
  clientId?: string | null;
  projectId?: string | null;
  notes?: string;
  createdBy?: string | null;
}): Promise<ReferenceAssetRecord> {
  await ensureReferenceAssetsTable();
  const name = input.name.trim();
  if (!name) throw new Error("Reference name is required");
  if (!input.url?.trim()) throw new Error("Reference image is required");
  const kind: ReferenceKind =
    input.kind && KINDS.includes(input.kind) ? input.kind : "reference";

  const { rows } = await db().query<ReferenceAssetRecord>(
    `insert into reference_assets
       (client_id, project_id, name, kind, url, notes, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [
      input.clientId ?? null,
      input.projectId ?? null,
      name,
      kind,
      input.url.trim(),
      input.notes?.trim() ?? "",
      input.createdBy ?? null,
    ]
  );
  if (!rows[0]) throw new Error("Could not create reference");
  return rows[0];
}

/**
 * Add a new version of an existing reference. The prior current version is
 * archived so the library shows one "current" per lineage; history is kept.
 */
export async function addReferenceVersion(
  assetId: string,
  url: string,
  notes?: string
): Promise<ReferenceAssetRecord> {
  await ensureReferenceAssetsTable();
  const current = await db().query<ReferenceAssetRecord>(
    `select * from reference_assets where id = $1`,
    [assetId]
  );
  const base = current.rows[0];
  if (!base) throw new Error("Reference not found");
  const rootId = base.parent_id ?? base.id;

  const next = await db().query<ReferenceAssetRecord>(
    `insert into reference_assets
       (client_id, project_id, name, kind, url, notes, version, parent_id, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning *`,
    [
      base.client_id,
      base.project_id,
      base.name,
      base.kind,
      url.trim(),
      notes?.trim() ?? base.notes,
      base.version + 1,
      rootId,
      base.created_by,
    ]
  );
  // Archive the version we superseded.
  await db().query(
    `update reference_assets set archived_at = now(), updated_at = now()
     where id = $1`,
    [base.id]
  );
  return next.rows[0];
}

export async function renameReferenceAsset(
  id: string,
  name: string
): Promise<ReferenceAssetRecord | null> {
  await ensureReferenceAssetsTable();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  const { rows } = await db().query<ReferenceAssetRecord>(
    `update reference_assets set name = $2, updated_at = now()
     where id = $1 returning *`,
    [id, trimmed]
  );
  return rows[0] ?? null;
}

export async function archiveReferenceAsset(id: string): Promise<void> {
  await ensureReferenceAssetsTable();
  await db().query(
    `update reference_assets set archived_at = now(), updated_at = now()
     where id = $1`,
    [id]
  );
}

/**
 * A one-line description of the attached references, for a text-only planner.
 *
 * The images themselves go to the image model; the planner only needs to know
 * *what* they are so it writes the brief around the right character, product
 * or look rather than inventing its own. Unknown URLs (a direct upload that
 * was never saved to the library) are counted but not named.
 */
export async function describeReferences(urls: string[]): Promise<string> {
  const wanted = urls.map((u) => u.trim()).filter(Boolean);
  if (wanted.length === 0) return "";
  await ensureReferenceAssetsTable();

  const { rows } = await db().query<{
    name: string;
    kind: string;
    notes: string;
  }>(
    `select name, kind, notes from reference_assets
     where url = any($1::text[]) and archived_at is null`,
    [wanted]
  );

  const named = rows.map((r) =>
    [`${r.name} (${r.kind})`, r.notes.trim()].filter(Boolean).join(" — ")
  );
  const unnamed = wanted.length - rows.length;
  if (unnamed > 0) {
    named.push(`${unnamed} attached image${unnamed === 1 ? "" : "s"}`);
  }

  return (
    "Reference images are attached and every frame will be rendered against " +
    `them: ${named.join("; ")}. Write the shots around exactly these — do not ` +
    "invent a different subject, product or look."
  );
}
