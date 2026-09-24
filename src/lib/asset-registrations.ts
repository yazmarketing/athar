import "server-only";
import { db, onceProcess } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  ASSET_LIBRARY_LIMIT,
  createAsset,
  deleteAsset,
  listAssets,
  oldestVerifiedAsset,
} from "@/lib/byteplus-assets";
import { publishFittedAssetImage } from "@/lib/fit-byteplus-asset-image";

export type AssetRegistrationRecord = {
  id: string;
  image_url: string;
  name: string;
  category: string | null;
  tagged_name: string | null;
  group_id: string | null;
  status: "queued" | "processing" | "completed" | "failed";
  byteplus_id: string | null;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

async function ensureAssetRegistrationsTableUncached() {
  await db().query(`
    create table if not exists public.asset_registrations (
      id uuid primary key default gen_random_uuid(),
      image_url text not null,
      name text not null,
      category text,
      tagged_name text,
      group_id text,
      status text not null default 'queued'
        check (status in ('queued', 'processing', 'completed', 'failed')),
      byteplus_id text,
      error text,
      created_by uuid references public.users (id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create index if not exists asset_registrations_status_idx
      on public.asset_registrations (status, created_at desc)
  `);
}

export const ensureAssetRegistrationsTable = onceProcess(
  ensureAssetRegistrationsTableUncached
);

export async function queueAssetRegistration(input: {
  imageUrl: string;
  name: string;
  category?: string | null;
  taggedName?: string | null;
  groupId: string;
  createdBy?: string | null;
}): Promise<AssetRegistrationRecord> {
  await ensureAssetRegistrationsTable();
  const { rows } = await db().query<AssetRegistrationRecord>(
    `insert into asset_registrations
       (image_url, name, category, tagged_name, group_id, created_by, status)
     values ($1, $2, $3, $4, $5, $6, 'processing')
     returning *`,
    [
      input.imageUrl,
      input.name,
      input.category ?? null,
      input.taggedName ?? null,
      input.groupId,
      input.createdBy ?? null,
    ]
  );
  if (!rows[0]) throw new Error("Could not queue asset registration");
  return rows[0];
}

export async function getAssetRegistration(
  id: string
): Promise<AssetRegistrationRecord | null> {
  await ensureAssetRegistrationsTable();
  const { rows } = await db().query<AssetRegistrationRecord>(
    `select * from asset_registrations where id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listOpenAssetRegistrations(): Promise<
  AssetRegistrationRecord[]
> {
  await ensureAssetRegistrationsTable();
  const { rows } = await db().query<AssetRegistrationRecord>(
    `select * from asset_registrations
     where status in ('queued', 'processing', 'failed')
     order by created_at desc`
  );
  return rows;
}

/** BytePlus listed this face — stop showing the local pending row. */
export async function completeRegistrationsMatching(
  byteplusNames: Set<string>
): Promise<void> {
  if (byteplusNames.size === 0) return;
  await ensureAssetRegistrationsTable();
  const { rows } = await db().query<{ id: string; name: string }>(
    `select id, name from asset_registrations
     where status in ('queued', 'processing', 'failed')`
  );
  const done = rows.filter((r) => byteplusNames.has(r.name)).map((r) => r.id);
  if (done.length === 0) return;
  await db().query(
    `update asset_registrations
     set status = 'completed', error = null, updated_at = now()
     where id = any($1::uuid[])`,
    [done]
  );
}

/**
 * Take due rows so only one worker calls CreateAsset. Queued always;
 * processing/failed only if the last attempt looks dead.
 */
export async function claimDueRegistrations(
  limit = 3
): Promise<AssetRegistrationRecord[]> {
  await ensureAssetRegistrationsTable();
  const { rows } = await db().query<AssetRegistrationRecord>(
    `update asset_registrations
     set status = 'processing', error = null, updated_at = now()
     where id in (
       select id from asset_registrations
       where status = 'queued'
          or (status = 'processing' and updated_at < now() - interval '3 minutes')
          or (status = 'failed' and updated_at < now() - interval '30 seconds')
       order by created_at asc
       limit $1
       for update skip locked
     )
     returning *`,
    [limit]
  );
  return rows;
}

export async function processAssetRegistration(
  row: AssetRegistrationRecord,
  audit?: { userId: string; userEmail: string | null }
): Promise<void> {
  const previous = registrationQueue.atharAssetRegistrationQueue ?? Promise.resolve();
  const current = previous.then(() => processAssetRegistrationSerial(row, audit));
  registrationQueue.atharAssetRegistrationQueue = current.catch(() => undefined);
  await current;
}

const registrationQueue = globalThis as typeof globalThis & {
  atharAssetRegistrationQueue?: Promise<void>;
};

async function processAssetRegistrationSerial(
  row: AssetRegistrationRecord,
  audit?: { userId: string; userEmail: string | null }
): Promise<void> {
  const groupId = row.group_id;
  if (!groupId) {
    await markRegistrationFailed(row.id, "Missing asset group");
    return;
  }
  try {
    let url = row.image_url;
    try {
      url = await publishFittedAssetImage(row.image_url);
    } catch (err) {
      console.error("Could not resize asset photo before BytePlus:", err);
    }
    const existing = await listAssets(groupId, { timeoutMs: 12_000 });
    if (existing.length >= ASSET_LIBRARY_LIMIT) {
      const rotating = oldestVerifiedAsset(existing);
      if (!rotating) {
        throw new Error(
          "The BytePlus asset library is full, but no verified asset is available to rotate yet. Wait for verification and retry."
        );
      }
      await deleteAsset(rotating.Id);
      await logAudit({
        userId: audit?.userId ?? row.created_by,
        userEmail: audit?.userEmail ?? null,
        action: "asset_auto_rotate",
        subjectType: "asset",
        subjectId: rotating.Id,
        meta: {
          reason: "provider_limit",
          limit: ASSET_LIBRARY_LIMIT,
          removed_name: rotating.Name ?? null,
          replacement_registration_id: row.id,
        },
      });
    }
    const asset = await createAsset({
      groupId,
      url,
      name: row.tagged_name ?? row.name,
    });
    await db().query(
      `update asset_registrations
       set status = 'completed', byteplus_id = $2, error = null, updated_at = now()
       where id = $1`,
      [row.id, asset.Id]
    );
    if (audit) {
      await logAudit({
        userId: audit.userId,
        userEmail: audit.userEmail,
        action: "asset_create",
        subjectType: "asset",
        subjectId: asset.Id,
        meta: { group_id: groupId, registration_id: row.id },
      });
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Asset registration failed";
    const friendly = /height must be between/i.test(message)
      ? "This photo is too tall for BytePlus. Crop to a single portrait and try again."
      : /width must be between/i.test(message)
        ? "This photo is too wide for BytePlus. Crop to a single portrait and try again."
        : message;
    // Timeout often means BytePlus is still moderating — keep it queued
    // so the next list/retry can pick it up instead of looking deleted.
    if (/taking too long/i.test(message)) {
      await db().query(
        `update asset_registrations
         set status = 'queued', error = $2, updated_at = now()
         where id = $1`,
        [row.id, message]
      );
      return;
    }
    await markRegistrationFailed(row.id, friendly);
    console.error(`BytePlus asset registration failed for ${row.image_url}:`, err);
  }
}

async function markRegistrationFailed(id: string, error: string) {
  await db().query(
    `update asset_registrations
     set status = 'failed', error = $2, updated_at = now()
     where id = $1`,
    [id, error]
  );
}

export async function deleteAssetRegistration(id: string): Promise<boolean> {
  await ensureAssetRegistrationsTable();
  const { rowCount } = await db().query(
    `delete from asset_registrations where id = $1`,
    [id]
  );
  return (rowCount ?? 0) > 0;
}

export function registrationAsLibraryAsset(row: AssetRegistrationRecord) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status === "failed" ? "Failed" : "Processing",
    url: row.image_url,
    error: row.error,
  };
}
