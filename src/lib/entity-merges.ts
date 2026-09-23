import "server-only";
import type { PoolClient } from "pg";
import { db } from "@/lib/db";

type ForeignKeyReference = {
  schema_name: string;
  table_name: string;
  column_name: string;
};

export type MergeSummary = {
  moved: Record<string, number>;
  totalMoved: number;
};

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function foreignKeysReferencing(
  client: PoolClient,
  parentTable: "clients" | "projects"
) {
  const { rows } = await client.query<ForeignKeyReference>(
    `select child_ns.nspname as schema_name,
            child.relname as table_name,
            child_att.attname as column_name
       from pg_constraint fk
       join pg_class child on child.oid = fk.conrelid
       join pg_namespace child_ns on child_ns.oid = child.relnamespace
       join pg_class parent on parent.oid = fk.confrelid
       join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
       join lateral unnest(fk.conkey) with ordinality child_key(attnum, ord) on true
       join lateral unnest(fk.confkey) with ordinality parent_key(attnum, ord)
         on parent_key.ord = child_key.ord
       join pg_attribute child_att
         on child_att.attrelid = child.oid and child_att.attnum = child_key.attnum
       join pg_attribute parent_att
         on parent_att.attrelid = parent.oid and parent_att.attnum = parent_key.attnum
      where fk.contype = 'f'
        and parent_ns.nspname = 'public'
        and parent.relname = $1
        and parent_att.attname = 'id'
        and child_ns.nspname = 'public'`,
    [parentTable]
  );
  return rows;
}

async function moveReferences(
  client: PoolClient,
  parentTable: "clients" | "projects",
  sourceId: string,
  targetId: string
) {
  const references = await foreignKeysReferencing(client, parentTable);
  const moved: Record<string, number> = {};

  for (const reference of references) {
    // Favorites are unique per voice/client. If both clients already favorite
    // the same voice, retain the destination row and discard only the duplicate
    // source row before applying the generic foreign-key move.
    if (
      parentTable === "clients" &&
      reference.table_name === "tts_voice_favorites" &&
      reference.column_name === "client_id"
    ) {
      await client.query(
        `delete from public.tts_voice_favorites source
          where source.client_id = $1
            and exists (
              select 1 from public.tts_voice_favorites target
               where target.client_id = $2
                 and target.voice_id = source.voice_id
            )`,
        [sourceId, targetId]
      );
    }

    const table = `${quoteIdentifier(reference.schema_name)}.${quoteIdentifier(reference.table_name)}`;
    const column = quoteIdentifier(reference.column_name);
    const result = await client.query(
      `update ${table} set ${column} = $2 where ${column} = $1`,
      [sourceId, targetId]
    );
    const key = `${reference.table_name}.${reference.column_name}`;
    moved[key] = (moved[key] ?? 0) + (result.rowCount ?? 0);
  }

  return moved;
}

function summarize(moved: Record<string, number>): MergeSummary {
  return {
    moved,
    totalMoved: Object.values(moved).reduce((sum, count) => sum + count, 0),
  };
}

export async function mergeClients(sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new Error("Choose a different destination client");
  const client = await db().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string; name: string }>(
      `select id, name from clients where id = any($1::uuid[]) for update`,
      [[sourceId, targetId]]
    );
    const source = rows.find((row) => row.id === sourceId);
    const target = rows.find((row) => row.id === targetId);
    if (!source) throw new Error("Source client not found");
    if (!target) throw new Error("Destination client not found");

    const moved = await moveReferences(client, "clients", sourceId, targetId);
    // Keep the legacy display-name columns aligned with their new owner.
    await client.query(
      `update projects set client = $2, updated_at = now() where client_id = $1`,
      [targetId, target.name]
    );
    await client.query(
      `update brand_kits set client = $2, updated_at = now() where client_id = $1`,
      [targetId, target.name]
    );
    await client.query(`delete from clients where id = $1`, [sourceId]);
    await client.query("commit");
    return { source, target, summary: summarize(moved) };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function mergeProjects(sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new Error("Choose a different destination project");
  const client = await db().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{
      id: string;
      name: string;
      client_id: string | null;
    }>(
      `select id, name, client_id from projects where id = any($1::uuid[]) for update`,
      [[sourceId, targetId]]
    );
    const source = rows.find((row) => row.id === sourceId);
    const target = rows.find((row) => row.id === targetId);
    if (!source) throw new Error("Source project not found");
    if (!target) throw new Error("Destination project not found");
    if (source.client_id !== target.client_id) {
      throw new Error("Projects must belong to the same client before merging");
    }

    const moved = await moveReferences(client, "projects", sourceId, targetId);
    await client.query(`delete from projects where id = $1`, [sourceId]);
    await client.query("commit");
    return { source, target, summary: summarize(moved) };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
