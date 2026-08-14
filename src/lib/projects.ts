import "server-only";
import { db } from "@/lib/db";
import type { ProjectRecord } from "@/lib/types";

export async function ensureProjectsTable() {
  await db().query(`
    create table if not exists public.projects (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      client text,
      created_by uuid references public.users (id) on delete set null,
      archived_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create index if not exists projects_created_at_idx
      on public.projects (created_at desc)
  `);
}

export async function listProjects(includeArchived = false): Promise<ProjectRecord[]> {
  await ensureProjectsTable();
  const { rows } = await db().query<ProjectRecord>(
    `select p.*,
            count(g.id)::int as generation_count
     from projects p
     left join generations g on g.project_id = p.id
     where ($1::boolean or p.archived_at is null)
     group by p.id
     order by p.created_at desc`,
    [includeArchived]
  );
  return rows.map((r) => ({
    ...r,
    generation_count: Number(r.generation_count ?? 0),
  }));
}

export async function getProject(id: string): Promise<ProjectRecord | null> {
  await ensureProjectsTable();
  const { rows } = await db().query<ProjectRecord>(
    `select p.*,
            count(g.id)::int as generation_count
     from projects p
     left join generations g on g.project_id = p.id
     where p.id = $1
     group by p.id`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, generation_count: Number(row.generation_count ?? 0) };
}

export async function createProject(
  name: string,
  client: string | null,
  createdBy: string | null
): Promise<ProjectRecord> {
  await ensureProjectsTable();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name is required");

  const { rows } = await db().query<ProjectRecord>(
    `insert into projects (name, client, created_by)
     values ($1, $2, $3)
     returning *`,
    [trimmed, client?.trim() || null, createdBy]
  );
  if (!rows[0]) throw new Error("Could not create project");
  return { ...rows[0], generation_count: 0 };
}

export async function updateProject(
  id: string,
  patch: { name?: string; client?: string | null; archived?: boolean }
): Promise<ProjectRecord | null> {
  await ensureProjectsTable();
  const sets: string[] = ["updated_at = now()"];
  const values: unknown[] = [];
  let i = 1;

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Project name is required");
    sets.push(`name = $${i++}`);
    values.push(trimmed);
  }
  if (patch.client !== undefined) {
    sets.push(`client = $${i++}`);
    values.push(patch.client?.trim() || null);
  }
  if (patch.archived !== undefined) {
    sets.push(`archived_at = $${i++}`);
    values.push(patch.archived ? new Date().toISOString() : null);
  }

  if (sets.length === 1) return getProject(id);

  values.push(id);
  const { rows } = await db().query<ProjectRecord>(
    `update projects set ${sets.join(", ")} where id = $${i} returning *`,
    values
  );
  return rows[0] ?? null;
}

export async function projectExists(id: string): Promise<boolean> {
  await ensureProjectsTable();
  const { rows } = await db().query(`select id from projects where id = $1`, [
    id,
  ]);
  return Boolean(rows[0]);
}
