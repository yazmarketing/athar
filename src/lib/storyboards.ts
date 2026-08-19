import "server-only";
import { db } from "@/lib/db";
import type {
  StoryboardCastMember,
  StoryboardFrameRecord,
  StoryboardLook,
  StoryboardRecord,
} from "@/lib/types";

/** Fields a caller may set on a frame. Everything else is derived. */
export type FramePatch = Partial<
  Pick<
    StoryboardFrameRecord,
    | "title"
    | "prompt"
    | "motion"
    | "shot_size"
    | "dialogue"
    | "notes"
    | "aspect"
    | "duration_s"
    | "lock_to_anchor"
    | "is_blank"
    | "cast_ids"
    | "image_url"
    | "video_url"
    | "generation_id"
    | "video_job_id"
  >
>;

/**
 * Create the tables on first use, the way every other store in this app does,
 * so a fresh database works without anyone remembering to run migrations.
 * Mirrors db/migrations/019_storyboards.sql.
 */
export async function ensureStoryboardTables() {
  await db().query(`
    create table if not exists public.storyboards (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      brief text not null default '',
      look jsonb,
      client_id uuid references public.clients (id) on delete set null,
      project_id uuid references public.projects (id) on delete set null,
      brand_kit_id uuid references public.brand_kits (id) on delete set null,
      aspect text not null default '16:9',
      style_id text not null default 'raw',
      cast_members jsonb not null default '[]'::jsonb,
      banned_elements text[] not null default '{}',
      look_locked boolean not null default false,
      reference_urls text[] not null default '{}',
      created_by uuid references public.users (id) on delete set null,
      archived_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await db().query(`
    alter table public.storyboards
      add column if not exists reference_urls text[] not null default '{}'
  `);
  await db().query(`
    alter table public.storyboards
      add column if not exists style_id text not null default 'raw'
  `);
  await db().query(`
    alter table public.storyboards
      add column if not exists cast_members jsonb not null default '[]'::jsonb
  `);
  await db().query(`
    alter table public.storyboards
      add column if not exists banned_elements text[] not null default '{}'
  `);
  await db().query(`
    alter table public.storyboards
      add column if not exists look_locked boolean not null default false
  `);
  await db().query(`
    create table if not exists public.storyboard_frames (
      id uuid primary key default gen_random_uuid(),
      storyboard_id uuid not null
        references public.storyboards (id) on delete cascade,
      position integer not null default 0,
      title text not null default '',
      prompt text not null default '',
      motion text not null default '',
      shot_size text not null default '',
      dialogue text not null default '',
      notes text not null default '',
      aspect text,
      duration_s integer,
      lock_to_anchor boolean not null default true,
      is_blank boolean not null default false,
      image_url text,
      video_url text,
      generation_id uuid references public.generations (id) on delete set null,
      video_job_id uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await db().query(`
    alter table public.storyboard_frames
      add column if not exists lock_to_anchor boolean not null default true
  `);
  await db().query(`
    alter table public.storyboard_frames
      add column if not exists is_blank boolean not null default false
  `);
  await db().query(`
    alter table public.storyboard_frames
      add column if not exists cast_ids text[] not null default '{}'
  `);
  await db().query(`
    create index if not exists storyboard_frames_board_idx
      on public.storyboard_frames (storyboard_id, position)
  `);
  await db().query(`
    create index if not exists storyboards_created_at_idx
      on public.storyboards (created_at desc)
  `);
}

const FRAME_COLUMNS = `id, storyboard_id, position, title, prompt, motion,
  shot_size, dialogue, notes, aspect, duration_s, lock_to_anchor, is_blank,
  cast_ids, image_url, video_url, generation_id, video_job_id, created_at,
  updated_at`;

export async function listStoryboards(opts: {
  clientId?: string | null;
  projectId?: string | null;
  includeArchived?: boolean;
} = {}): Promise<StoryboardRecord[]> {
  await ensureStoryboardTables();
  const { rows } = await db().query<StoryboardRecord>(
    `select s.*,
            c.name as client_name,
            p.name as project_name,
            count(f.id)::int as frame_count,
            count(f.image_url)::int as rendered_count,
            -- Cover is the first rendered frame in board order, so a board
            -- with a gap at the front still shows a picture.
            (select f2.image_url
               from storyboard_frames f2
              where f2.storyboard_id = s.id and f2.image_url is not null
              order by f2.position asc, f2.created_at asc
              limit 1) as cover_url
       from storyboards s
       left join storyboard_frames f on f.storyboard_id = s.id
       left join clients c on c.id = s.client_id
       left join projects p on p.id = s.project_id
      where ($1::boolean or s.archived_at is null)
        and ($2::uuid is null or s.client_id = $2::uuid)
        and ($3::uuid is null or s.project_id = $3::uuid)
      group by s.id, c.name, p.name
      order by s.updated_at desc`,
    [opts.includeArchived ?? false, opts.clientId ?? null, opts.projectId ?? null]
  );
  return rows.map((r) => ({
    ...r,
    frame_count: Number(r.frame_count ?? 0),
    rendered_count: Number(r.rendered_count ?? 0),
  }));
}

/** A board plus its frames, in board order. */
export async function getStoryboard(
  id: string
): Promise<StoryboardRecord | null> {
  await ensureStoryboardTables();
  const { rows } = await db().query<StoryboardRecord>(
    `select s.*, c.name as client_name, p.name as project_name
       from storyboards s
       left join clients c on c.id = s.client_id
       left join projects p on p.id = s.project_id
      where s.id = $1`,
    [id]
  );
  const board = rows[0];
  if (!board) return null;
  return { ...board, frames: await listFrames(id) };
}

export async function listFrames(
  storyboardId: string
): Promise<StoryboardFrameRecord[]> {
  const { rows } = await db().query<StoryboardFrameRecord>(
    `select ${FRAME_COLUMNS} from storyboard_frames
      where storyboard_id = $1
      order by position asc, created_at asc`,
    [storyboardId]
  );
  return rows;
}

export async function createStoryboard(input: {
  title: string;
  brief?: string;
  clientId?: string | null;
  projectId?: string | null;
  brandKitId?: string | null;
  aspect?: string;
  styleId?: string;
  referenceUrls?: string[];
  createdBy: string | null;
}): Promise<StoryboardRecord> {
  await ensureStoryboardTables();
  const title = input.title.trim();
  if (!title) throw new Error("A storyboard title is required");

  const { rows } = await db().query<StoryboardRecord>(
    `insert into storyboards
       (title, brief, client_id, project_id, brand_kit_id, aspect, style_id,
        reference_urls, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning *`,
    [
      title,
      input.brief?.trim() ?? "",
      input.clientId ?? null,
      input.projectId ?? null,
      input.brandKitId ?? null,
      input.aspect ?? "16:9",
      input.styleId ?? "raw",
      cleanUrls(input.referenceUrls),
      input.createdBy,
    ]
  );
  if (!rows[0]) throw new Error("Could not create the storyboard");
  return { ...rows[0], frames: [], frame_count: 0, rendered_count: 0 };
}

export async function updateStoryboard(
  id: string,
  patch: {
    title?: string;
    brief?: string;
    clientId?: string | null;
    projectId?: string | null;
    brandKitId?: string | null;
    aspect?: string;
    styleId?: string;
    referenceUrls?: string[];
    look?: StoryboardLook | null;
    cast?: StoryboardCastMember[];
    bannedElements?: string[];
    lookLocked?: boolean;
    archived?: boolean;
  }
): Promise<StoryboardRecord | null> {
  await ensureStoryboardTables();
  const sets: string[] = ["updated_at = now()"];
  const values: unknown[] = [];
  let i = 1;

  const set = (sql: string, value: unknown) => {
    sets.push(sql.replace("$?", `$${i++}`));
    values.push(value);
  };

  if (patch.title !== undefined) {
    const trimmed = patch.title.trim();
    if (!trimmed) throw new Error("A storyboard title is required");
    set("title = $?", trimmed);
  }
  if (patch.brief !== undefined) set("brief = $?", patch.brief.trim());
  if (patch.clientId !== undefined) set("client_id = $?", patch.clientId);
  if (patch.projectId !== undefined) set("project_id = $?", patch.projectId);
  if (patch.brandKitId !== undefined) set("brand_kit_id = $?", patch.brandKitId);
  if (patch.aspect !== undefined) set("aspect = $?", patch.aspect);
  if (patch.styleId !== undefined) set("style_id = $?", patch.styleId);
  if (patch.referenceUrls !== undefined) {
    set("reference_urls = $?::text[]", cleanUrls(patch.referenceUrls));
  }
  if (patch.cast !== undefined) {
    set("cast_members = $?::jsonb", JSON.stringify(patch.cast));
  }
  if (patch.bannedElements !== undefined) {
    set("banned_elements = $?::text[]", patch.bannedElements);
  }
  if (patch.lookLocked !== undefined) set("look_locked = $?", patch.lookLocked);
  if (patch.look !== undefined) {
    set("look = $?::jsonb", patch.look ? JSON.stringify(patch.look) : null);
  }
  if (patch.archived !== undefined) {
    set("archived_at = $?", patch.archived ? new Date().toISOString() : null);
  }

  if (sets.length === 1) return getStoryboard(id);

  values.push(id);
  const { rows } = await db().query<StoryboardRecord>(
    `update storyboards set ${sets.join(", ")} where id = $${i} returning *`,
    values
  );
  const board = rows[0];
  if (!board) return null;
  return { ...board, frames: await listFrames(id) };
}

export async function deleteStoryboard(id: string): Promise<void> {
  await ensureStoryboardTables();
  // Frames cascade. Generations are deliberately left alone — they live in
  // the Library on their own merit and outlive the board that planned them.
  const { rowCount } = await db().query(
    `delete from storyboards where id = $1`,
    [id]
  );
  if (!rowCount) throw new Error("Storyboard not found");
}

/** Append a frame to the end of the board. */
export async function addFrame(
  storyboardId: string,
  frame: FramePatch = {}
): Promise<StoryboardFrameRecord> {
  await ensureStoryboardTables();
  const { rows } = await db().query<StoryboardFrameRecord>(
    `insert into storyboard_frames
       (storyboard_id, position, title, prompt, motion, shot_size, dialogue,
        notes, aspect, duration_s, lock_to_anchor, is_blank, cast_ids)
     values (
       $1,
       coalesce((select max(position) + 1 from storyboard_frames
                  where storyboard_id = $1), 0),
       $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
     )
     returning ${FRAME_COLUMNS}`,
    [
      storyboardId,
      frame.title ?? "",
      frame.prompt ?? "",
      frame.motion ?? "",
      frame.shot_size ?? "",
      frame.dialogue ?? "",
      frame.notes ?? "",
      frame.aspect ?? null,
      frame.duration_s ?? null,
      frame.lock_to_anchor ?? true,
      frame.is_blank ?? false,
      frame.cast_ids ?? [],
    ]
  );
  if (!rows[0]) throw new Error("Could not add the frame");
  await touchBoard(storyboardId);
  return rows[0];
}

/**
 * Replace every frame on the board in one transaction. Used by the planner:
 * re-planning a brief should not leave half the old board behind.
 */
export async function replaceFrames(
  storyboardId: string,
  frames: FramePatch[]
): Promise<StoryboardFrameRecord[]> {
  await ensureStoryboardTables();
  const client = await db().connect();
  try {
    await client.query("begin");
    await client.query(
      `delete from storyboard_frames where storyboard_id = $1`,
      [storyboardId]
    );
    for (const [index, frame] of frames.entries()) {
      await client.query(
        `insert into storyboard_frames
           (storyboard_id, position, title, prompt, motion, shot_size,
            dialogue, notes, aspect, duration_s, lock_to_anchor, is_blank,
            cast_ids)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          storyboardId,
          index,
          frame.title ?? "",
          frame.prompt ?? "",
          frame.motion ?? "",
          frame.shot_size ?? "",
          frame.dialogue ?? "",
          frame.notes ?? "",
          frame.aspect ?? null,
          frame.duration_s ?? null,
          frame.lock_to_anchor ?? true,
          frame.is_blank ?? false,
          frame.cast_ids ?? [],
        ]
      );
    }
    await client.query(
      `update storyboards set updated_at = now() where id = $1`,
      [storyboardId]
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
  return listFrames(storyboardId);
}

export async function updateFrame(
  storyboardId: string,
  frameId: string,
  patch: FramePatch
): Promise<StoryboardFrameRecord | null> {
  await ensureStoryboardTables();
  const columns: Array<keyof FramePatch> = [
    "title",
    "prompt",
    "motion",
    "shot_size",
    "dialogue",
    "notes",
    "aspect",
    "duration_s",
    "lock_to_anchor",
    "is_blank",
    "cast_ids",
    "image_url",
    "video_url",
    "generation_id",
    "video_job_id",
  ];

  const sets: string[] = ["updated_at = now()"];
  const values: unknown[] = [];
  let i = 1;
  for (const column of columns) {
    if (patch[column] === undefined) continue;
    sets.push(`${column} = $${i++}`);
    values.push(patch[column]);
  }
  if (sets.length === 1) return null;

  values.push(frameId, storyboardId);
  const { rows } = await db().query<StoryboardFrameRecord>(
    `update storyboard_frames set ${sets.join(", ")}
      where id = $${i++} and storyboard_id = $${i}
      returning ${FRAME_COLUMNS}`,
    values
  );
  const frame = rows[0];
  if (frame) await touchBoard(storyboardId);
  return frame ?? null;
}

export async function deleteFrame(
  storyboardId: string,
  frameId: string
): Promise<void> {
  await ensureStoryboardTables();
  const { rowCount } = await db().query(
    `delete from storyboard_frames where id = $1 and storyboard_id = $2`,
    [frameId, storyboardId]
  );
  if (!rowCount) throw new Error("Frame not found");
  await touchBoard(storyboardId);
}

/**
 * Rewrite the running order. Ids not in `order` keep their relative order
 * after the listed ones, so a stale client can't silently drop a frame.
 */
export async function reorderFrames(
  storyboardId: string,
  order: string[]
): Promise<StoryboardFrameRecord[]> {
  await ensureStoryboardTables();
  const current = await listFrames(storyboardId);
  const known = new Set(current.map((f) => f.id));
  const ranked = order.filter((id) => known.has(id));
  const rest = current.map((f) => f.id).filter((id) => !ranked.includes(id));
  const finalOrder = [...ranked, ...rest];

  const client = await db().connect();
  try {
    await client.query("begin");
    for (const [index, id] of finalOrder.entries()) {
      await client.query(
        `update storyboard_frames set position = $1, updated_at = now()
          where id = $2 and storyboard_id = $3`,
        [index, id, storyboardId]
      );
    }
    await client.query(
      `update storyboards set updated_at = now() where id = $1`,
      [storyboardId]
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
  return listFrames(storyboardId);
}

/**
 * Trim, drop blanks and de-duplicate. Capped at 6: the generate API accepts 8
 * reference images total and the board's own key frame needs a slot, so a
 * runaway list would silently push the anchor out.
 */
function cleanUrls(urls?: string[]): string[] {
  return Array.from(
    new Set((urls ?? []).map((u) => u.trim()).filter(Boolean))
  ).slice(0, 6);
}

/** Keep `updated_at` meaningful — the board list is sorted by it. */
async function touchBoard(storyboardId: string) {
  await db().query(`update storyboards set updated_at = now() where id = $1`, [
    storyboardId,
  ]);
}
