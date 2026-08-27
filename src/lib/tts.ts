import "server-only";
import { randomBytes } from "crypto";
import { db, onceProcess } from "@/lib/db";
import type {
  TtsAlignment,
  TtsFavoriteVoice,
  TtsGenerationRecord,
  TtsSegment,
  TtsVoiceRecord,
} from "@/lib/types";

/**
 * Text-to-speech store. Mirrors db/migrations/028_tts.sql and, like every
 * other store here, creates its own tables on first use so a fresh database
 * works without anyone remembering to run migrations.
 */
async function ensureTtsTablesUncached() {
  await db().query(`
    create table if not exists public.tts_generations (
      id uuid primary key default gen_random_uuid(),
      title text not null default '',
      status text not null default 'ready'
        check (status in ('ready', 'failed')),
      error text,
      segments jsonb not null default '[]'::jsonb,
      text text not null default '',
      model text not null default '',
      stability numeric(3, 2) not null default 0.5,
      speed numeric(3, 2) not null default 1.0,
      sample_rate integer not null default 24000,
      dialect text not null default 'auto',
      word_timestamps boolean not null default false,
      timestamps jsonb,
      char_count integer not null default 0,
      -- Munsit doesn't publish a per-character rate — see munsit-tts.ts.
      cost numeric(10, 4) not null default 0,
      output_url text,
      duration_s numeric(10, 2),
      render_ms integer,
      client_id uuid references public.clients (id) on delete set null,
      project_id uuid references public.projects (id) on delete set null,
      created_by uuid references public.users (id) on delete set null,
      -- Every regenerate of the same script shares its first generation's
      -- group_id — that's what "Versions" in the sidebar actually lists.
      -- A brand new script gets a fresh one (the column default).
      group_id uuid not null default gen_random_uuid(),
      archived_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      completed_at timestamptz
    )
  `);
  await db().query(`
    alter table public.tts_generations
      add column if not exists group_id uuid not null default gen_random_uuid()
  `);
  // Nullable FK to tts_director_analyses — set only when a generation came
  // from the VO Director pipeline. Guarded here too (not just in
  // tts-director.ts) so createTtsGeneration never depends on call order.
  await db().query(`
    alter table public.tts_generations
      add column if not exists tts_director_analysis_id uuid
  `);
  await db().query(`
    create index if not exists tts_generations_director_analysis_idx
      on public.tts_generations (tts_director_analysis_id)
  `);
  await db().query(`
    create index if not exists tts_generations_group_idx
      on public.tts_generations (group_id, created_at desc)
  `);
  await db().query(`
    create table if not exists public.tts_voices (
      id uuid primary key default gen_random_uuid(),
      munsit_voice_id text not null unique,
      name text not null,
      description text,
      gender text,
      age text,
      languages text[] not null default '{}',
      dialects text[] not null default '{}',
      sample_url text,
      avatar_url text,
      created_by uuid references public.users (id) on delete set null,
      created_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create index if not exists tts_generations_created_at_idx
      on public.tts_generations (created_at desc)
  `);
  await db().query(`
    create index if not exists tts_generations_client_idx
      on public.tts_generations (client_id)
  `);
  await db().query(`
    create index if not exists tts_generations_fts_idx
      on public.tts_generations
      using gin (to_tsvector('simple', text))
  `);
  await db().query(`
    create table if not exists public.tts_voice_favorites (
      id uuid primary key default gen_random_uuid(),
      voice_id text not null,
      voice_name text not null,
      -- Null means "every client" — a favorite saved before one was picked,
      -- or one the team wants available everywhere.
      client_id uuid references public.clients (id) on delete cascade,
      created_by uuid references public.users (id) on delete set null,
      created_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create unique index if not exists tts_voice_favorites_unique_idx
      on public.tts_voice_favorites
      (voice_id, coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid))
  `);
  await db().query(`
    create table if not exists public.tts_shares (
      token text primary key,
      generation_id uuid not null
        references public.tts_generations (id) on delete cascade,
      created_by uuid references public.users (id) on delete set null,
      created_at timestamptz not null default now(),
      revoked_at timestamptz
    )
  `);
}

/** Memoised per process — see `onceProcess`. */
export const ensureTtsTables = onceProcess(ensureTtsTablesUncached);

const LIST_COLUMNS = `
  g.*,
  c.name as client_name,
  p.name as project_name,
  u.name as created_by_name
`;

const LIST_JOINS = `
  from tts_generations g
  left join clients c on c.id = g.client_id
  left join projects p on p.id = g.project_id
  left join users u on u.id = g.created_by
`;

export async function createTtsGeneration(input: {
  title?: string;
  status: "ready" | "failed";
  error?: string | null;
  segments: TtsSegment[];
  text: string;
  model: string;
  stability: number;
  speed: number;
  sampleRate: number;
  dialect: string;
  wordTimestamps: boolean;
  timestamps?: TtsAlignment[] | null;
  charCount: number;
  cost: number;
  outputUrl?: string | null;
  durationS?: number | null;
  renderMs?: number | null;
  clientId?: string | null;
  projectId?: string | null;
  createdBy?: string | null;
  /** Continues an existing work's version history — omit to start a new one. */
  groupId?: string | null;
  /** Set only when this generation came from the VO Director pipeline. */
  directorAnalysisId?: string | null;
}): Promise<TtsGenerationRecord> {
  await ensureTtsTables();
  const { rows } = await db().query<TtsGenerationRecord>(
    `insert into tts_generations
       (title, status, error, segments, text, model, stability, speed, sample_rate,
        dialect, word_timestamps, timestamps, char_count, cost, output_url,
        duration_s, render_ms, client_id, project_id, created_by, group_id, completed_at,
        tts_director_analysis_id)
     values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14,
             $15, $16, $17, $18, $19, $20, coalesce($21::uuid, gen_random_uuid()), now(), $22)
     returning *`,
    [
      input.title?.trim() || "Untitled voice-over",
      input.status,
      input.error ?? null,
      JSON.stringify(input.segments),
      input.text,
      input.model,
      input.stability,
      input.speed,
      input.sampleRate,
      input.dialect,
      input.wordTimestamps,
      input.timestamps ? JSON.stringify(input.timestamps) : null,
      input.charCount,
      input.cost,
      input.outputUrl ?? null,
      input.durationS ?? null,
      input.renderMs ?? null,
      input.clientId ?? null,
      input.projectId ?? null,
      input.createdBy ?? null,
      input.groupId ?? null,
      input.directorAnalysisId ?? null,
    ]
  );
  return rows[0];
}

export async function listTtsGenerations(opts: {
  clientId?: string | null;
  projectId?: string | null;
  createdBy?: string | null;
  /** Just the versions of one work — see the group_id comment on the table. */
  groupId?: string | null;
  includeArchived?: boolean;
  limit?: number;
}): Promise<TtsGenerationRecord[]> {
  await ensureTtsTables();
  const { rows } = await db().query<TtsGenerationRecord>(
    `select ${LIST_COLUMNS} ${LIST_JOINS}
     where ($1::uuid is null or g.client_id = $1::uuid)
       and ($2::uuid is null or g.project_id = $2::uuid)
       and ($3::uuid is null or g.created_by = $3::uuid)
       and ($4::boolean or g.archived_at is null)
       and ($5::uuid is null or g.group_id = $5::uuid)
     order by g.created_at desc
     limit $6`,
    [
      opts.clientId || null,
      opts.projectId || null,
      opts.createdBy || null,
      Boolean(opts.includeArchived),
      opts.groupId || null,
      Math.min(opts.limit ?? 100, 400),
    ]
  );
  return rows;
}

export async function getTtsGeneration(id: string): Promise<TtsGenerationRecord | null> {
  await ensureTtsTables();
  const { rows } = await db().query<TtsGenerationRecord>(
    `select ${LIST_COLUMNS} ${LIST_JOINS} where g.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export type TtsGenerationPatch = {
  title?: string;
  clientId?: string | null;
  projectId?: string | null;
  archived?: boolean;
};

export async function updateTtsGeneration(
  id: string,
  patch: TtsGenerationPatch
): Promise<TtsGenerationRecord | null> {
  await ensureTtsTables();
  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (patch.title !== undefined) push("title", patch.title);
  if (patch.clientId !== undefined) push("client_id", patch.clientId);
  if (patch.projectId !== undefined) push("project_id", patch.projectId);
  if (patch.archived !== undefined) sets.push(`archived_at = ${patch.archived ? "now()" : "null"}`);
  if (sets.length === 0) return getTtsGeneration(id);

  sets.push("updated_at = now()");
  values.push(id);
  const { rows } = await db().query<TtsGenerationRecord>(
    `update tts_generations set ${sets.join(", ")}
     where id = $${values.length} returning *`,
    values
  );
  return rows[0] ?? null;
}

export async function deleteTtsGeneration(id: string): Promise<void> {
  await ensureTtsTables();
  await db().query(`delete from tts_generations where id = $1`, [id]);
}

export type TtsSearchHit = {
  id: string;
  title: string;
  text: string;
  client_name: string | null;
  created_at: string;
};

/** Full-text + ILIKE search across generated voice-overs, like transcripts. */
export async function searchTtsGenerations(query: string, limit = 50): Promise<TtsSearchHit[]> {
  await ensureTtsTables();
  const q = query.trim();
  if (!q) return [];
  const { rows } = await db().query<TtsSearchHit>(
    `select g.id, g.title, g.text, c.name as client_name, g.created_at
     from tts_generations g
     left join clients c on c.id = g.client_id
     where g.archived_at is null
       and (to_tsvector('simple', g.text) @@ plainto_tsquery('simple', $1)
            or g.text ilike '%' || $1 || '%'
            or g.title ilike '%' || $1 || '%')
     order by g.created_at desc
     limit $2`,
    [q, Math.min(limit, 200)]
  );
  return rows;
}

// --- cloned voices -----------------------------------------------------

export async function createTtsVoice(input: {
  munsitVoiceId: string;
  name: string;
  description?: string | null;
  gender?: string | null;
  age?: string | null;
  languages?: string[];
  dialects?: string[];
  sampleUrl?: string | null;
  avatarUrl?: string | null;
  createdBy?: string | null;
}): Promise<TtsVoiceRecord> {
  await ensureTtsTables();
  const { rows } = await db().query<TtsVoiceRecord>(
    `insert into tts_voices
       (munsit_voice_id, name, description, gender, age, languages, dialects,
        sample_url, avatar_url, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning *`,
    [
      input.munsitVoiceId,
      input.name,
      input.description ?? null,
      input.gender ?? null,
      input.age ?? null,
      input.languages ?? [],
      input.dialects ?? [],
      input.sampleUrl ?? null,
      input.avatarUrl ?? null,
      input.createdBy ?? null,
    ]
  );
  return rows[0];
}

export async function listTtsVoices(): Promise<TtsVoiceRecord[]> {
  await ensureTtsTables();
  const { rows } = await db().query<TtsVoiceRecord>(
    `select * from tts_voices order by created_at desc`
  );
  return rows;
}

export async function deleteTtsVoice(id: string): Promise<void> {
  await ensureTtsTables();
  await db().query(`delete from tts_voices where id = $1`, [id]);
}

// --- favorite voices -----------------------------------------------------

/**
 * Favorite a voice for a client — shared across the team, not per-user, so
 * whoever picks up a client's work next sees the same shortlist. Idempotent:
 * favoriting an already-favorited voice just returns the existing row.
 */
export async function favoriteVoice(input: {
  voiceId: string;
  voiceName: string;
  clientId?: string | null;
  createdBy?: string | null;
}): Promise<TtsFavoriteVoice> {
  await ensureTtsTables();
  const { rows } = await db().query<TtsFavoriteVoice>(
    `insert into tts_voice_favorites (voice_id, voice_name, client_id, created_by)
     values ($1, $2, $3, $4)
     on conflict (voice_id, coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid))
     do update set voice_name = excluded.voice_name
     returning *`,
    [input.voiceId, input.voiceName, input.clientId ?? null, input.createdBy ?? null]
  );
  return rows[0];
}

export async function unfavoriteVoice(voiceId: string, clientId?: string | null): Promise<void> {
  await ensureTtsTables();
  await db().query(
    `delete from tts_voice_favorites
     where voice_id = $1 and client_id is not distinct from $2::uuid`,
    [voiceId, clientId ?? null]
  );
}

/** Favorites for this client, plus every client-agnostic ("global") one. */
export async function listFavoriteVoices(clientId?: string | null): Promise<TtsFavoriteVoice[]> {
  await ensureTtsTables();
  const { rows } = await db().query<TtsFavoriteVoice>(
    `select * from tts_voice_favorites
     where client_id is null or client_id = $1::uuid
     order by created_at desc`,
    [clientId ?? null]
  );
  return rows;
}

// --- share links -----------------------------------------------------

export async function createTtsShare(
  generationId: string,
  createdBy?: string | null
): Promise<string> {
  await ensureTtsTables();
  const token = randomBytes(16).toString("hex");
  await db().query(
    `insert into tts_shares (token, generation_id, created_by)
     values ($1, $2, $3)`,
    [token, generationId, createdBy ?? null]
  );
  return token;
}

export async function getSharedTtsGeneration(
  token: string
): Promise<TtsGenerationRecord | null> {
  await ensureTtsTables();
  const { rows } = await db().query<{ generation_id: string }>(
    `select generation_id from tts_shares
     where token = $1 and revoked_at is null`,
    [token]
  );
  const id = rows[0]?.generation_id;
  if (!id) return null;
  return getTtsGeneration(id);
}

export async function revokeTtsShare(token: string): Promise<void> {
  await ensureTtsTables();
  await db().query(`update tts_shares set revoked_at = now() where token = $1`, [token]);
}
