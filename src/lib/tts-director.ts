import "server-only";
import { db, onceProcess } from "@/lib/db";
import { ensureTtsTables } from "@/lib/tts";
import { LEARNING_MIN_SAMPLE } from "@/config/tts-director";
import type {
  TtsDirectorAnalysis,
  TtsDirectorCampaignContext,
  TtsDirectorMode,
  TtsDirectorOverallDirection,
  TtsDirectorSegment,
  TtsDirectorTake,
  TtsPhoneticNote,
} from "@/lib/types";

/**
 * VO Director store. Mirrors db/migrations/030_tts_director.sql — an
 * analysis precedes synthesis (nothing here calls Munsit); only a stitched
 * master becomes a real tts_generations row (see /api/tts/director/master).
 */
async function ensureTtsDirectorTablesUncached() {
  // tts_generations.tts_director_analysis_id is guarded there too, but this
  // guarantees the table exists before this function's own ALTER runs,
  // regardless of which store initializes first.
  await ensureTtsTables();
  await db().query(`
    create table if not exists public.tts_director_analyses (
      id uuid primary key default gen_random_uuid(),
      mode text not null check (mode in ('quick', 'director')),
      status text not null default 'draft'
        check (status in ('draft', 'directed', 'adapted', 'phonetics_ready', 'complete', 'failed')),
      error text,
      original_text text not null,
      campaign_context jsonb not null default '{}'::jsonb,
      overall_direction jsonb,
      register_strength numeric(3, 2) not null default 0.50,
      dialect text not null default 'emirati' check (dialect in ('emirati', 'fusha')),
      model text,
      client_id uuid references public.clients (id) on delete set null,
      project_id uuid references public.projects (id) on delete set null,
      created_by uuid references public.users (id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create index if not exists tts_director_analyses_created_at_idx
      on public.tts_director_analyses (created_at desc)
  `);
  await db().query(`
    create table if not exists public.tts_director_segments (
      id uuid primary key default gen_random_uuid(),
      analysis_id uuid not null references public.tts_director_analyses (id) on delete cascade,
      idx integer not null,
      speaker_label text,
      voice_id text,
      original text not null,
      spoken text not null default '',
      tts text not null default '',
      emotion text,
      intensity numeric(3, 2),
      pace text check (pace is null or pace in ('slow', 'normal', 'fast')),
      continuity text,
      avoid text[] not null default '{}',
      suggested_stability numeric(3, 2),
      suggested_speed numeric(3, 2),
      break_justification text,
      phonetic_notes jsonb not null default '[]'::jsonb,
      selected_take_id uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (analysis_id, idx)
    )
  `);
  await db().query(`
    alter table public.tts_director_segments
      add column if not exists selected_take_id uuid
  `);
  await db().query(`
    create index if not exists tts_director_segments_analysis_idx
      on public.tts_director_segments (analysis_id, idx)
  `);
  await db().query(`
    create table if not exists public.tts_director_takes (
      id uuid primary key default gen_random_uuid(),
      segment_id uuid not null references public.tts_director_segments (id) on delete cascade,
      preset text not null default 'custom'
        check (preset in ('natural', 'controlled', 'expressive', 'custom')),
      voice_id text not null,
      stability numeric(3, 2) not null,
      speed numeric(3, 2) not null,
      text text not null,
      status text not null default 'ready' check (status in ('ready', 'failed')),
      error text,
      output_url text,
      duration_s numeric(10, 2),
      char_count integer not null default 0,
      cost numeric(10, 4) not null default 0,
      created_by uuid references public.users (id) on delete set null,
      created_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create index if not exists tts_director_takes_segment_idx
      on public.tts_director_takes (segment_id, created_at desc)
  `);
  await db().query(`
    create table if not exists public.tts_director_selection_events (
      id uuid primary key default gen_random_uuid(),
      segment_id uuid not null references public.tts_director_segments (id) on delete cascade,
      take_id uuid not null references public.tts_director_takes (id) on delete cascade,
      voice_id text not null,
      outcome text not null check (outcome in ('selected', 'rejected')),
      context jsonb not null default '{}'::jsonb,
      stability numeric(3, 2) not null,
      speed numeric(3, 2) not null,
      created_by uuid references public.users (id) on delete set null,
      created_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create index if not exists tts_director_selection_events_voice_idx
      on public.tts_director_selection_events (voice_id, outcome, created_at desc)
  `);
  await db().query(`
    create index if not exists tts_director_selection_events_context_idx
      on public.tts_director_selection_events using gin (context)
  `);
  // Column + index are also guarded in tts.ts's own ensureTtsTables (without
  // a FK, to avoid an ADD COLUMN IF NOT EXISTS race depending on init order)
  // — this is a no-op once either has run.
  await db().query(`
    alter table public.tts_generations
      add column if not exists tts_director_analysis_id uuid
  `);
  await db().query(`
    create index if not exists tts_generations_director_analysis_idx
      on public.tts_generations (tts_director_analysis_id)
  `);
}

export const ensureTtsDirectorTables = onceProcess(ensureTtsDirectorTablesUncached);

// --- analyses -----------------------------------------------------------

export async function createTtsDirectorAnalysis(input: {
  mode: TtsDirectorMode;
  originalText: string;
  campaignContext?: TtsDirectorCampaignContext;
  registerStrength?: number;
  dialect?: "emirati" | "fusha";
  clientId?: string | null;
  projectId?: string | null;
  createdBy?: string | null;
}): Promise<TtsDirectorAnalysis> {
  await ensureTtsDirectorTables();
  const { rows } = await db().query<TtsDirectorAnalysis>(
    `insert into tts_director_analyses
       (mode, original_text, campaign_context, register_strength, dialect,
        client_id, project_id, created_by)
     values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
     returning *`,
    [
      input.mode,
      input.originalText,
      JSON.stringify(input.campaignContext ?? {}),
      input.registerStrength ?? 0.5,
      input.dialect ?? "emirati",
      input.clientId ?? null,
      input.projectId ?? null,
      input.createdBy ?? null,
    ]
  );
  return rows[0];
}

export type TtsDirectorAnalysisPatch = {
  status?: TtsDirectorAnalysis["status"];
  error?: string | null;
  overallDirection?: TtsDirectorOverallDirection | null;
  registerStrength?: number;
  model?: string | null;
};

export async function updateTtsDirectorAnalysis(
  id: string,
  patch: TtsDirectorAnalysisPatch
): Promise<TtsDirectorAnalysis | null> {
  await ensureTtsDirectorTables();
  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (patch.status !== undefined) push("status", patch.status);
  if (patch.error !== undefined) push("error", patch.error);
  if (patch.overallDirection !== undefined) {
    values.push(patch.overallDirection ? JSON.stringify(patch.overallDirection) : null);
    sets.push(`overall_direction = $${values.length}::jsonb`);
  }
  if (patch.registerStrength !== undefined) push("register_strength", patch.registerStrength);
  if (patch.model !== undefined) push("model", patch.model);
  if (sets.length === 0) return getTtsDirectorAnalysis(id);

  sets.push("updated_at = now()");
  values.push(id);
  const { rows } = await db().query<TtsDirectorAnalysis>(
    `update tts_director_analyses set ${sets.join(", ")} where id = $${values.length} returning *`,
    values
  );
  return rows[0] ?? null;
}

export async function getTtsDirectorAnalysis(id: string): Promise<TtsDirectorAnalysis | null> {
  await ensureTtsDirectorTables();
  const { rows } = await db().query<TtsDirectorAnalysis>(
    `select * from tts_director_analyses where id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

// --- segments -------------------------------------------------------------

/** Pass 1 creates the segmentation — replaces any existing segments for this analysis. */
export async function createTtsDirectorSegments(
  analysisId: string,
  segments: {
    idx: number;
    speakerLabel?: string | null;
    voiceId?: string | null;
    original: string;
    spoken?: string;
    tts?: string;
    emotion?: string | null;
    intensity?: number | null;
    pace?: "slow" | "normal" | "fast" | null;
    continuity?: string | null;
    avoid?: string[];
    suggestedStability?: number | null;
    suggestedSpeed?: number | null;
  }[]
): Promise<TtsDirectorSegment[]> {
  await ensureTtsDirectorTables();
  await db().query(`delete from tts_director_segments where analysis_id = $1`, [analysisId]);
  const out: TtsDirectorSegment[] = [];
  for (const s of segments) {
    const { rows } = await db().query<TtsDirectorSegment>(
      `insert into tts_director_segments
         (analysis_id, idx, speaker_label, voice_id, original, spoken, tts,
          emotion, intensity, pace, continuity, avoid, suggested_stability, suggested_speed)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       returning *`,
      [
        analysisId,
        s.idx,
        s.speakerLabel ?? null,
        s.voiceId ?? null,
        s.original,
        s.spoken ?? "",
        s.tts ?? "",
        s.emotion ?? null,
        s.intensity ?? null,
        s.pace ?? null,
        s.continuity ?? null,
        s.avoid ?? [],
        s.suggestedStability ?? null,
        s.suggestedSpeed ?? null,
      ]
    );
    out.push(rows[0]);
  }
  return out;
}

export async function listTtsDirectorSegments(analysisId: string): Promise<TtsDirectorSegment[]> {
  await ensureTtsDirectorTables();
  const { rows } = await db().query<TtsDirectorSegment>(
    `select * from tts_director_segments where analysis_id = $1 order by idx asc`,
    [analysisId]
  );
  return rows;
}

export async function getTtsDirectorSegment(id: string): Promise<TtsDirectorSegment | null> {
  await ensureTtsDirectorTables();
  const { rows } = await db().query<TtsDirectorSegment>(
    `select * from tts_director_segments where id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export type TtsDirectorSegmentPatch = {
  voiceId?: string | null;
  spoken?: string;
  tts?: string;
  emotion?: string | null;
  intensity?: number | null;
  pace?: "slow" | "normal" | "fast" | null;
  continuity?: string | null;
  avoid?: string[];
  suggestedStability?: number | null;
  suggestedSpeed?: number | null;
  breakJustification?: string | null;
  phoneticNotes?: TtsPhoneticNote[];
  selectedTakeId?: string | null;
};

export async function patchTtsDirectorSegment(
  id: string,
  patch: TtsDirectorSegmentPatch
): Promise<TtsDirectorSegment | null> {
  await ensureTtsDirectorTables();
  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (patch.voiceId !== undefined) push("voice_id", patch.voiceId);
  if (patch.spoken !== undefined) push("spoken", patch.spoken);
  if (patch.tts !== undefined) push("tts", patch.tts);
  if (patch.emotion !== undefined) push("emotion", patch.emotion);
  if (patch.intensity !== undefined) push("intensity", patch.intensity);
  if (patch.pace !== undefined) push("pace", patch.pace);
  if (patch.continuity !== undefined) push("continuity", patch.continuity);
  if (patch.avoid !== undefined) push("avoid", patch.avoid);
  if (patch.suggestedStability !== undefined) push("suggested_stability", patch.suggestedStability);
  if (patch.suggestedSpeed !== undefined) push("suggested_speed", patch.suggestedSpeed);
  if (patch.breakJustification !== undefined) push("break_justification", patch.breakJustification);
  if (patch.phoneticNotes !== undefined) {
    values.push(JSON.stringify(patch.phoneticNotes));
    sets.push(`phonetic_notes = $${values.length}::jsonb`);
  }
  if (patch.selectedTakeId !== undefined) push("selected_take_id", patch.selectedTakeId);
  if (sets.length === 0) return getTtsDirectorSegment(id);

  sets.push("updated_at = now()");
  values.push(id);
  const { rows } = await db().query<TtsDirectorSegment>(
    `update tts_director_segments set ${sets.join(", ")} where id = $${values.length} returning *`,
    values
  );
  return rows[0] ?? null;
}

// --- takes ------------------------------------------------------------

export async function createTtsDirectorTake(input: {
  segmentId: string;
  preset: "natural" | "controlled" | "expressive" | "custom";
  voiceId: string;
  stability: number;
  speed: number;
  text: string;
  status: "ready" | "failed";
  error?: string | null;
  outputUrl?: string | null;
  durationS?: number | null;
  charCount: number;
  cost: number;
  createdBy?: string | null;
}): Promise<TtsDirectorTake> {
  await ensureTtsDirectorTables();
  const { rows } = await db().query<TtsDirectorTake>(
    `insert into tts_director_takes
       (segment_id, preset, voice_id, stability, speed, text, status, error,
        output_url, duration_s, char_count, cost, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning *`,
    [
      input.segmentId,
      input.preset,
      input.voiceId,
      input.stability,
      input.speed,
      input.text,
      input.status,
      input.error ?? null,
      input.outputUrl ?? null,
      input.durationS ?? null,
      input.charCount,
      input.cost,
      input.createdBy ?? null,
    ]
  );
  return rows[0];
}

export async function listTtsDirectorTakes(segmentId: string): Promise<TtsDirectorTake[]> {
  await ensureTtsDirectorTables();
  const { rows } = await db().query<TtsDirectorTake>(
    `select * from tts_director_takes where segment_id = $1 order by created_at asc`,
    [segmentId]
  );
  return rows;
}

export async function getTtsDirectorTake(id: string): Promise<TtsDirectorTake | null> {
  await ensureTtsDirectorTables();
  const { rows } = await db().query<TtsDirectorTake>(
    `select * from tts_director_takes where id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

/** Every take for every segment of an analysis, keyed by segment id. */
export async function listTtsDirectorTakesForAnalysis(
  analysisId: string
): Promise<Record<string, TtsDirectorTake[]>> {
  await ensureTtsDirectorTables();
  const { rows } = await db().query<TtsDirectorTake>(
    `select t.* from tts_director_takes t
     join tts_director_segments s on s.id = t.segment_id
     where s.analysis_id = $1
     order by t.created_at asc`,
    [analysisId]
  );
  const out: Record<string, TtsDirectorTake[]> = {};
  for (const row of rows) {
    (out[row.segment_id] ??= []).push(row);
  }
  return out;
}

// --- selection / learning loop -----------------------------------------

/**
 * Record one "selected" and N "rejected" events, and set the segment's
 * selected_take_id. This log alone is the learning loop — see
 * getLearnedDefaults below.
 */
export async function recordTtsDirectorSelection(opts: {
  segmentId: string;
  selectedTakeId: string;
  rejectedTakeIds: string[];
  voiceId: string;
  context: { emotion?: string | null; pace?: string | null; dialect?: string; register_strength?: number };
  createdBy?: string | null;
}): Promise<void> {
  await ensureTtsDirectorTables();
  const client = await db().connect();
  try {
    await client.query("begin");
    const insertEvent = async (takeId: string, outcome: "selected" | "rejected") => {
      const take = await client.query<{ stability: number; speed: number }>(
        `select stability, speed from tts_director_takes where id = $1`,
        [takeId]
      );
      const row = take.rows[0];
      await client.query(
        `insert into tts_director_selection_events
           (segment_id, take_id, voice_id, outcome, context, stability, speed, created_by)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
        [
          opts.segmentId,
          takeId,
          opts.voiceId,
          outcome,
          JSON.stringify(opts.context ?? {}),
          row?.stability ?? 0.5,
          row?.speed ?? 1.0,
          opts.createdBy ?? null,
        ]
      );
    };
    await insertEvent(opts.selectedTakeId, "selected");
    for (const rejectedId of opts.rejectedTakeIds) {
      await insertEvent(rejectedId, "rejected");
    }
    await client.query(
      `update tts_director_segments set selected_take_id = $1, updated_at = now() where id = $2`,
      [opts.selectedTakeId, opts.segmentId]
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export type LearnedDefaults = { stability: number; speed: number; sampleSize: number };

/**
 * Cascaded average over selected takes: exact (voice, emotion, pace) match
 * first, falling back to (voice, emotion), then (voice) alone — no trained
 * model, just SQL over the append-only selection log.
 */
export async function getLearnedDefaults(opts: {
  voiceId: string;
  emotion?: string | null;
  pace?: string | null;
}): Promise<LearnedDefaults | null> {
  await ensureTtsDirectorTables();
  const filters: { emotion: string | null; pace: string | null }[] = [
    { emotion: opts.emotion ?? null, pace: opts.pace ?? null },
    { emotion: opts.emotion ?? null, pace: null },
    { emotion: null, pace: null },
  ];
  for (const f of filters) {
    if (f.emotion === null && f.pace !== null) continue;
    const { rows } = await db().query<{ avg_stability: number; avg_speed: number; n: string }>(
      `select avg(stability) as avg_stability, avg(speed) as avg_speed, count(*) as n
       from tts_director_selection_events
       where voice_id = $1 and outcome = 'selected'
         and ($2::text is null or context->>'emotion' = $2)
         and ($3::text is null or context->>'pace' = $3)`,
      [opts.voiceId, f.emotion, f.pace]
    );
    const row = rows[0];
    const n = Number(row?.n ?? 0);
    if (n >= LEARNING_MIN_SAMPLE) {
      return { stability: Number(row.avg_stability), speed: Number(row.avg_speed), sampleSize: n };
    }
  }
  return null;
}
