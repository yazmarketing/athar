import "server-only";
import { db } from "@/lib/db";
import type {
  StoryboardRecord,
  StoryboardEntityRecord,
  StoryboardPanelRecord,
  StoryboardRegister,
} from "@/lib/types";

/**
 * Storyboards — the world, then the panels.
 *
 * The tables mirror how a board is actually made: decide who and where once
 * (entities, each pinned to an approved reference image), then draw panels
 * that reference those decisions by slug. Panels never restate a character's
 * description, so panel 23 cannot drift away from panel 4.
 */

export async function ensureStoryboardTables() {
  await db().query(`
    create table if not exists public.storyboards (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      source_text text not null default '',
      register text not null default 'sketch',
      aspect text not null default '16:9',
      look jsonb not null default '{}'::jsonb,
      status text not null default 'draft',
      client_id uuid references public.clients (id) on delete set null,
      project_id uuid references public.projects (id) on delete set null,
      brand_kit_id uuid references public.brand_kits (id) on delete set null,
      created_by uuid references public.users (id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    )
  `);
  await db().query(`
    create table if not exists public.storyboard_entities (
      id uuid primary key default gen_random_uuid(),
      storyboard_id uuid not null
        references public.storyboards (id) on delete cascade,
      slug text not null,
      kind text not null default 'character',
      name text not null,
      description text not null default '',
      wardrobe text not null default '',
      reference_url text,
      approved_at timestamptz,
      seed bigint,
      position integer not null default 0,
      created_at timestamptz not null default now(),
      unique (storyboard_id, slug)
    )
  `);
  await db().query(`
    create table if not exists public.storyboard_panels (
      id uuid primary key default gen_random_uuid(),
      storyboard_id uuid not null
        references public.storyboards (id) on delete cascade,
      number integer not null,
      shot_size text not null default 'MS',
      angle text not null default 'eye',
      lens text not null default '',
      screen_direction text not null default 'neutral',
      action text not null default '',
      dialogue text not null default '',
      motion text not null default '',
      duration_s numeric(6, 2),
      entity_slugs text[] not null default '{}',
      prompt text not null default '',
      status text not null default 'pending',
      error text,
      image_url text,
      generation_id uuid references public.generations (id) on delete set null,
      continuity_score numeric(4, 3),
      continuity_notes text,
      attempts integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (storyboard_id, number)
    )
  `);
  await db().query(`
    create index if not exists storyboards_client_idx
      on public.storyboards (client_id, created_at desc)
      where deleted_at is null
  `);
  await db().query(`
    create index if not exists storyboard_panels_board_idx
      on public.storyboard_panels (storyboard_id, number)
  `);
  await db().query(`
    create index if not exists storyboard_entities_board_idx
      on public.storyboard_entities (storyboard_id, position)
  `);
}

export async function listStoryboards(
  clientId?: string | null
): Promise<StoryboardRecord[]> {
  await ensureStoryboardTables();
  const { rows } = await db().query<StoryboardRecord>(
    `select s.*,
            count(p.id)::int as panel_count,
            count(p.id) filter (where p.status = 'ready')::int as ready_count
     from storyboards s
     left join storyboard_panels p on p.storyboard_id = s.id
     where s.deleted_at is null
       and ($1::uuid is null or s.client_id = $1::uuid)
     group by s.id
     order by s.created_at desc`,
    [clientId ?? null]
  );
  return rows.map((r) => ({
    ...r,
    panel_count: Number(r.panel_count ?? 0),
    ready_count: Number(r.ready_count ?? 0),
  }));
}

export type FullStoryboard = {
  board: StoryboardRecord;
  entities: StoryboardEntityRecord[];
  panels: StoryboardPanelRecord[];
};

export async function getStoryboard(
  id: string
): Promise<FullStoryboard | null> {
  await ensureStoryboardTables();
  const { rows } = await db().query<StoryboardRecord>(
    `select * from storyboards where id = $1 and deleted_at is null`,
    [id]
  );
  const board = rows[0];
  if (!board) return null;

  const [entities, panels] = await Promise.all([
    db().query<StoryboardEntityRecord>(
      `select * from storyboard_entities where storyboard_id = $1
       order by position asc, created_at asc`,
      [id]
    ),
    db().query<StoryboardPanelRecord>(
      `select * from storyboard_panels where storyboard_id = $1
       order by number asc`,
      [id]
    ),
  ]);

  return { board, entities: entities.rows, panels: panels.rows };
}

export async function createStoryboard(input: {
  title: string;
  sourceText: string;
  register: StoryboardRegister;
  aspect: string;
  look: Record<string, unknown>;
  clientId: string | null;
  projectId: string | null;
  brandKitId: string | null;
  createdBy: string | null;
}): Promise<StoryboardRecord> {
  await ensureStoryboardTables();
  const { rows } = await db().query<StoryboardRecord>(
    `insert into storyboards
       (title, source_text, register, aspect, look, status,
        client_id, project_id, brand_kit_id, created_by)
     values ($1, $2, $3, $4, $5, 'bible', $6, $7, $8, $9)
     returning *`,
    [
      input.title.slice(0, 200),
      input.sourceText,
      input.register,
      input.aspect,
      JSON.stringify(input.look ?? {}),
      input.clientId,
      input.projectId,
      input.brandKitId,
      input.createdBy,
    ]
  );
  return rows[0];
}

export async function insertEntities(
  storyboardId: string,
  entities: {
    slug: string;
    kind: string;
    name: string;
    description: string;
    wardrobe: string;
  }[]
): Promise<StoryboardEntityRecord[]> {
  if (entities.length === 0) return [];
  const out: StoryboardEntityRecord[] = [];
  for (const [i, e] of entities.entries()) {
    const { rows } = await db().query<StoryboardEntityRecord>(
      `insert into storyboard_entities
         (storyboard_id, slug, kind, name, description, wardrobe, position, seed)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (storyboard_id, slug) do update set
         name = excluded.name,
         description = excluded.description,
         wardrobe = excluded.wardrobe
       returning *`,
      [
        storyboardId,
        e.slug,
        e.kind,
        e.name,
        e.description,
        e.wardrobe,
        i,
        // Fixed per entity so a re-rendered sheet stays the same character.
        Math.floor(Math.random() * 2 ** 31),
      ]
    );
    out.push(rows[0]);
  }
  return out;
}

export async function insertPanels(
  storyboardId: string,
  panels: {
    number: number;
    shotSize: string;
    angle: string;
    lens: string;
    screenDirection: string;
    action: string;
    dialogue: string;
    motion: string;
    durationS: number | null;
    entitySlugs: string[];
  }[]
): Promise<StoryboardPanelRecord[]> {
  if (panels.length === 0) return [];
  const out: StoryboardPanelRecord[] = [];
  for (const p of panels) {
    const { rows } = await db().query<StoryboardPanelRecord>(
      `insert into storyboard_panels
         (storyboard_id, number, shot_size, angle, lens, screen_direction,
          action, dialogue, motion, duration_s, entity_slugs)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (storyboard_id, number) do update set
         shot_size = excluded.shot_size,
         angle = excluded.angle,
         lens = excluded.lens,
         screen_direction = excluded.screen_direction,
         action = excluded.action,
         dialogue = excluded.dialogue,
         motion = excluded.motion,
         duration_s = excluded.duration_s,
         entity_slugs = excluded.entity_slugs,
         updated_at = now()
       returning *`,
      [
        storyboardId,
        p.number,
        p.shotSize,
        p.angle,
        p.lens,
        p.screenDirection,
        p.action,
        p.dialogue,
        p.motion,
        p.durationS,
        p.entitySlugs,
      ]
    );
    out.push(rows[0]);
  }
  return out;
}

export async function updateEntity(
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    wardrobe: string;
    referenceUrl: string | null;
    approved: boolean;
  }>
): Promise<StoryboardEntityRecord | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    sets.push(`${sql} = $${values.length}`);
  };
  if (patch.name !== undefined) add("name", patch.name);
  if (patch.description !== undefined) add("description", patch.description);
  if (patch.wardrobe !== undefined) add("wardrobe", patch.wardrobe);
  if (patch.referenceUrl !== undefined)
    add("reference_url", patch.referenceUrl);
  if (patch.approved !== undefined) {
    sets.push(`approved_at = ${patch.approved ? "now()" : "null"}`);
  }
  if (sets.length === 0) return null;
  values.push(id);
  const { rows } = await db().query<StoryboardEntityRecord>(
    `update storyboard_entities set ${sets.join(", ")}
     where id = $${values.length} returning *`,
    values
  );
  return rows[0] ?? null;
}

export async function updatePanel(
  id: string,
  patch: Partial<{
    shotSize: string;
    angle: string;
    lens: string;
    screenDirection: string;
    action: string;
    dialogue: string;
    motion: string;
    durationS: number | null;
    entitySlugs: string[];
    prompt: string;
    status: string;
    error: string | null;
    imageUrl: string | null;
    generationId: string | null;
    continuityScore: number | null;
    continuityNotes: string | null;
    attempts: number;
  }>
): Promise<StoryboardPanelRecord | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (patch.shotSize !== undefined) add("shot_size", patch.shotSize);
  if (patch.angle !== undefined) add("angle", patch.angle);
  if (patch.lens !== undefined) add("lens", patch.lens);
  if (patch.screenDirection !== undefined)
    add("screen_direction", patch.screenDirection);
  if (patch.action !== undefined) add("action", patch.action);
  if (patch.dialogue !== undefined) add("dialogue", patch.dialogue);
  if (patch.motion !== undefined) add("motion", patch.motion);
  if (patch.durationS !== undefined) add("duration_s", patch.durationS);
  if (patch.entitySlugs !== undefined) add("entity_slugs", patch.entitySlugs);
  if (patch.prompt !== undefined) add("prompt", patch.prompt);
  if (patch.status !== undefined) add("status", patch.status);
  if (patch.error !== undefined) add("error", patch.error);
  if (patch.imageUrl !== undefined) add("image_url", patch.imageUrl);
  if (patch.generationId !== undefined)
    add("generation_id", patch.generationId);
  if (patch.continuityScore !== undefined)
    add("continuity_score", patch.continuityScore);
  if (patch.continuityNotes !== undefined)
    add("continuity_notes", patch.continuityNotes);
  if (patch.attempts !== undefined) add("attempts", patch.attempts);
  if (sets.length === 0) return null;
  sets.push("updated_at = now()");
  values.push(id);
  const { rows } = await db().query<StoryboardPanelRecord>(
    `update storyboard_panels set ${sets.join(", ")}
     where id = $${values.length} returning *`,
    values
  );
  return rows[0] ?? null;
}

export async function setStoryboardStatus(id: string, status: string) {
  await db().query(
    `update storyboards set status = $2, updated_at = now() where id = $1`,
    [id, status]
  );
}

export async function deleteStoryboard(id: string) {
  await db().query(
    `update storyboards set deleted_at = now() where id = $1`,
    [id]
  );
}

export async function getPanel(
  id: string
): Promise<StoryboardPanelRecord | null> {
  const { rows } = await db().query<StoryboardPanelRecord>(
    `select * from storyboard_panels where id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getEntity(
  id: string
): Promise<StoryboardEntityRecord | null> {
  const { rows } = await db().query<StoryboardEntityRecord>(
    `select * from storyboard_entities where id = $1`,
    [id]
  );
  return rows[0] ?? null;
}
