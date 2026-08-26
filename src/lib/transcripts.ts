import "server-only";
import { randomBytes } from "crypto";
import { db, onceProcess } from "@/lib/db";
import type {
  TranscriptInsights,
  TranscriptRecord,
  TranscriptSegmentRecord,
  TranscriptStatus,
  TranscriptWord,
} from "@/lib/types";

/**
 * Transcript store. Mirrors db/migrations/025_transcripts.sql and, like every
 * other store here, creates its own tables on first use so a fresh database
 * works without anyone remembering to run migrations.
 */
async function ensureTranscriptTablesUncached() {
  await db().query(`
    create table if not exists public.transcripts (
      id uuid primary key default gen_random_uuid(),
      title text not null default '',
      status text not null default 'queued'
        check (status in ('queued', 'running', 'ready', 'failed', 'cancelled')),
      progress numeric(5, 2) not null default 0,
      stage text not null default '',
      error text,
      media_url text not null,
      media_kind text not null default 'audio'
        check (media_kind in ('audio', 'video')),
      media_bytes bigint,
      duration_s numeric(10, 2),
      language text,
      language_probability numeric(5, 4),
      task text not null default 'transcribe'
        check (task in ('transcribe', 'translate')),
      model text,
      device text,
      diarize boolean not null default true,
      speaker_names jsonb not null default '{}'::jsonb,
      vocabulary text not null default '',
      insights jsonb,
      client_id uuid references public.clients (id) on delete set null,
      project_id uuid references public.projects (id) on delete set null,
      created_by uuid references public.users (id) on delete set null,
      render_ms integer,
      -- OpenAI's whisper-1 is billed per minute — see openai-whisper.ts.
      cost numeric(10, 4) not null default 0,
      archived_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      completed_at timestamptz
    )
  `);
  await db().query(`
    alter table public.transcripts
      add column if not exists cost numeric(10, 4) not null default 0
  `);
  await db().query(`
    create table if not exists public.transcript_segments (
      id uuid primary key default gen_random_uuid(),
      transcript_id uuid not null
        references public.transcripts (id) on delete cascade,
      idx integer not null default 0,
      start_s numeric(10, 3) not null default 0,
      end_s numeric(10, 3) not null default 0,
      speaker text,
      text text not null default '',
      words jsonb not null default '[]'::jsonb,
      translations jsonb not null default '{}'::jsonb,
      edited boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create table if not exists public.transcript_shares (
      token text primary key,
      transcript_id uuid not null
        references public.transcripts (id) on delete cascade,
      created_by uuid references public.users (id) on delete set null,
      created_at timestamptz not null default now(),
      revoked_at timestamptz
    )
  `);
  await db().query(`
    create index if not exists transcripts_created_at_idx
      on public.transcripts (created_at desc)
  `);
  await db().query(`
    create index if not exists transcripts_client_idx
      on public.transcripts (client_id)
  `);
  await db().query(`
    create index if not exists transcripts_status_idx
      on public.transcripts (status, created_at desc)
  `);
  await db().query(`
    create index if not exists transcript_segments_transcript_idx
      on public.transcript_segments (transcript_id, idx)
  `);
  await db().query(`
    create index if not exists transcript_segments_fts_idx
      on public.transcript_segments
      using gin (to_tsvector('simple', text))
  `);
}

/** Memoised per process — see `onceProcess`. */
export const ensureTranscriptTables = onceProcess(ensureTranscriptTablesUncached);

const LIST_COLUMNS = `
  t.*,
  c.name as client_name,
  p.name as project_name,
  u.name as created_by_name,
  (select count(*)::int from transcript_segments s where s.transcript_id = t.id)
    as segment_count,
  (select count(distinct s.speaker)::int from transcript_segments s
    where s.transcript_id = t.id and s.speaker is not null) as speaker_count
`;

const LIST_JOINS = `
  from transcripts t
  left join clients c on c.id = t.client_id
  left join projects p on p.id = t.project_id
  left join users u on u.id = t.created_by
`;

export async function createTranscript(input: {
  title: string;
  mediaUrl: string;
  mediaKind: "audio" | "video";
  mediaBytes?: number | null;
  task?: "transcribe" | "translate";
  diarize?: boolean;
  vocabulary?: string;
  language?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  createdBy?: string | null;
}): Promise<TranscriptRecord> {
  await ensureTranscriptTables();
  const { rows } = await db().query<TranscriptRecord>(
    `insert into transcripts
       (title, media_url, media_kind, media_bytes,
        task, diarize, vocabulary, language, client_id, project_id, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning *`,
    [
      input.title.trim() || "Untitled recording",
      input.mediaUrl,
      input.mediaKind,
      input.mediaBytes ?? null,
      input.task ?? "transcribe",
      input.diarize === true,
      input.vocabulary?.trim() ?? "",
      input.language?.trim() || null,
      input.clientId ?? null,
      input.projectId ?? null,
      input.createdBy ?? null,
    ]
  );
  return rows[0];
}

export async function listTranscripts(opts: {
  clientId?: string | null;
  projectId?: string | null;
  createdBy?: string | null;
  includeArchived?: boolean;
  limit?: number;
}): Promise<TranscriptRecord[]> {
  await ensureTranscriptTables();
  const { rows } = await db().query<TranscriptRecord>(
    `select ${LIST_COLUMNS} ${LIST_JOINS}
     where ($1::uuid is null or t.client_id = $1::uuid)
       and ($2::uuid is null or t.project_id = $2::uuid)
       and ($3::uuid is null or t.created_by = $3::uuid)
       and ($4::boolean or t.archived_at is null)
     order by t.created_at desc
     limit $5`,
    [
      opts.clientId || null,
      opts.projectId || null,
      opts.createdBy || null,
      Boolean(opts.includeArchived),
      Math.min(opts.limit ?? 100, 400),
    ]
  );
  return rows;
}

export async function getTranscript(
  id: string,
  opts: { withSegments?: boolean } = {}
): Promise<TranscriptRecord | null> {
  await ensureTranscriptTables();
  const { rows } = await db().query<TranscriptRecord>(
    `select ${LIST_COLUMNS} ${LIST_JOINS} where t.id = $1`,
    [id]
  );
  const transcript = rows[0];
  if (!transcript) return null;
  if (opts.withSegments) {
    transcript.segments = await listSegments(id);
  }
  return transcript;
}

export async function listSegments(
  transcriptId: string
): Promise<TranscriptSegmentRecord[]> {
  await ensureTranscriptTables();
  const { rows } = await db().query<TranscriptSegmentRecord>(
    `select * from transcript_segments
     where transcript_id = $1 order by idx asc, start_s asc`,
    [transcriptId]
  );
  return rows;
}

export type TranscriptPatch = {
  title?: string;
  status?: TranscriptStatus;
  progress?: number;
  stage?: string;
  error?: string | null;
  durationS?: number | null;
  language?: string | null;
  languageProbability?: number | null;
  model?: string | null;
  device?: string | null;
  speakerNames?: Record<string, string>;
  vocabulary?: string;
  insights?: TranscriptInsights | null;
  clientId?: string | null;
  projectId?: string | null;
  renderMs?: number | null;
  cost?: number;
  archived?: boolean;
};

/** Column per patch key. Only the keys present in the patch are written. */
const PATCH_COLUMNS: Record<keyof TranscriptPatch, string> = {
  title: "title",
  status: "status",
  progress: "progress",
  stage: "stage",
  error: "error",
  durationS: "duration_s",
  language: "language",
  languageProbability: "language_probability",
  model: "model",
  device: "device",
  speakerNames: "speaker_names",
  vocabulary: "vocabulary",
  insights: "insights",
  clientId: "client_id",
  projectId: "project_id",
  renderMs: "render_ms",
  cost: "cost",
  archived: "archived_at",
};

export async function updateTranscript(
  id: string,
  patch: TranscriptPatch
): Promise<TranscriptRecord | null> {
  await ensureTranscriptTables();
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, column] of Object.entries(PATCH_COLUMNS)) {
    const value = patch[key as keyof TranscriptPatch];
    if (value === undefined) continue;
    if (key === "archived") {
      sets.push(`${column} = ${value ? "now()" : "null"}`);
      continue;
    }
    values.push(
      key === "speakerNames" || key === "insights"
        ? value === null
          ? null
          : JSON.stringify(value)
        : value
    );
    sets.push(`${column} = $${values.length}`);
  }

  // A terminal status is also the moment the clock stops.
  if (patch.status === "ready" || patch.status === "failed") {
    sets.push("completed_at = now()");
  }
  if (sets.length === 0) return getTranscript(id);

  sets.push("updated_at = now()");
  values.push(id);
  const { rows } = await db().query<TranscriptRecord>(
    `update transcripts set ${sets.join(", ")}
     where id = $${values.length} returning *`,
    values
  );
  return rows[0] ?? null;
}

export type IncomingSegment = {
  start_s: number;
  end_s: number;
  speaker?: string | null;
  text: string;
  words?: TranscriptWord[];
};

/**
 * Write one chunk's worth of segments.
 *
 * A long recording arrives in pieces, so this appends by default and
 * continues the numbering from what is already there. `replace` is how the
 * first chunk of a run clears the previous attempt — a re-run is a fresh
 * decode, not a merge, and half an old transcript interleaved with half a new
 * one would be worse than either.
 *
 * Either way it is one transaction, so an interrupted write leaves the
 * transcript as it was rather than half-updated.
 */
export async function appendSegments(
  transcriptId: string,
  segments: IncomingSegment[],
  opts: { replace?: boolean } = {}
): Promise<number> {
  await ensureTranscriptTables();
  if (segments.length === 0 && !opts.replace) return 0;

  const client = await db().connect();
  try {
    await client.query("begin");
    let base = 0;
    if (opts.replace) {
      await client.query(`delete from transcript_segments where transcript_id = $1`, [
        transcriptId,
      ]);
    } else {
      const { rows } = await client.query<{ next: number }>(
        `select coalesce(max(idx) + 1, 0)::int as next
         from transcript_segments where transcript_id = $1`,
        [transcriptId]
      );
      base = rows[0]?.next ?? 0;
    }
    // One multi-row insert — an interview can be thousands of segments and a
    // round trip each would take longer than the transcription did.
    const CHUNK = 400;
    for (let offset = 0; offset < segments.length; offset += CHUNK) {
      const slice = segments.slice(offset, offset + CHUNK);
      const values: unknown[] = [];
      const tuples = slice.map((seg, i) => {
        // `slot` is this row's place in the parameter list; `base` is where
        // its idx continues from. Two different offsets — naming them the
        // same thing silently numbered every segment i*7.
        const slot = i * 6;
        values.push(
          transcriptId,
          base + offset + i,
          seg.start_s,
          seg.end_s,
          seg.speaker ?? null,
          seg.text
        );
        return `($${slot + 1}, $${slot + 2}, $${slot + 3}, $${slot + 4}, $${slot + 5}, $${slot + 6}, $${slice.length * 6 + i + 1}::jsonb)`;
      });
      slice.forEach((seg) => values.push(JSON.stringify(seg.words ?? [])));
      await client.query(
        `insert into transcript_segments
           (transcript_id, idx, start_s, end_s, speaker, text, words)
         values ${tuples.join(", ")}`,
        values
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return segments.length;
}

export async function updateSegment(
  id: string,
  patch: {
    text?: string;
    speaker?: string | null;
    startS?: number;
    endS?: number;
    translations?: Record<string, string>;
  }
): Promise<TranscriptSegmentRecord | null> {
  await ensureTranscriptTables();
  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (patch.text !== undefined) {
    push("text", patch.text);
    // A corrected line no longer matches its word array, so the word-level
    // highlight for it is dropped rather than left pointing at old words.
    sets.push("words = '[]'::jsonb");
    sets.push("edited = true");
  }
  if (patch.speaker !== undefined) push("speaker", patch.speaker);
  if (patch.startS !== undefined) push("start_s", patch.startS);
  if (patch.endS !== undefined) push("end_s", patch.endS);
  if (patch.translations !== undefined) {
    values.push(JSON.stringify(patch.translations));
    sets.push(`translations = $${values.length}::jsonb`);
  }
  if (sets.length === 0) return null;

  sets.push("updated_at = now()");
  values.push(id);
  const { rows } = await db().query<TranscriptSegmentRecord>(
    `update transcript_segments set ${sets.join(", ")}
     where id = $${values.length} returning *`,
    values
  );
  return rows[0] ?? null;
}

/** Store one language's subtitle translation across a whole transcript. */
export async function saveTranslations(
  transcriptId: string,
  lang: string,
  bySegmentId: Record<string, string>
): Promise<number> {
  await ensureTranscriptTables();
  const entries = Object.entries(bySegmentId);
  if (entries.length === 0) return 0;
  const client = await db().connect();
  try {
    await client.query("begin");
    for (const [segmentId, text] of entries) {
      await client.query(
        `update transcript_segments
         set translations = translations || jsonb_build_object($1::text, $2::text),
             updated_at = now()
         where id = $3 and transcript_id = $4`,
        [lang, text, segmentId, transcriptId]
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return entries.length;
}

/**
 * Merge a segment into the one before it — the fix for a speaker turn the
 * diarizer split mid-sentence.
 */
export async function mergeSegmentUp(
  segmentId: string
): Promise<TranscriptSegmentRecord[] | null> {
  await ensureTranscriptTables();
  const { rows } = await db().query<TranscriptSegmentRecord>(
    `select * from transcript_segments where id = $1`,
    [segmentId]
  );
  const target = rows[0];
  if (!target || target.idx === 0) return null;

  const { rows: prevRows } = await db().query<TranscriptSegmentRecord>(
    `select * from transcript_segments
     where transcript_id = $1 and idx < $2 order by idx desc limit 1`,
    [target.transcript_id, target.idx]
  );
  const prev = prevRows[0];
  if (!prev) return null;

  const client = await db().connect();
  try {
    await client.query("begin");
    await client.query(
      `update transcript_segments
       set text = $1, end_s = $2, words = $3::jsonb, updated_at = now()
       where id = $4`,
      [
        `${prev.text} ${target.text}`.replace(/\s+/g, " ").trim(),
        target.end_s,
        JSON.stringify([...(prev.words ?? []), ...(target.words ?? [])]),
        prev.id,
      ]
    );
    await client.query(`delete from transcript_segments where id = $1`, [target.id]);
    await client.query(
      `update transcript_segments set idx = idx - 1
       where transcript_id = $1 and idx > $2`,
      [target.transcript_id, target.idx]
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return listSegments(target.transcript_id);
}

/**
 * Split a segment at a word boundary — the fix for two people landing in one
 * segment. `wordIndex` is the first word of the new second half.
 */
export async function splitSegment(
  segmentId: string,
  wordIndex: number
): Promise<TranscriptSegmentRecord[] | null> {
  await ensureTranscriptTables();
  const { rows } = await db().query<TranscriptSegmentRecord>(
    `select * from transcript_segments where id = $1`,
    [segmentId]
  );
  const target = rows[0];
  if (!target) return null;

  // Fall back to the text when a corrected line has no word timings left.
  const words = (target.words ?? []).length
    ? target.words
    : target.text
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => ({ w, s: target.start_s, e: target.end_s }));
  if (wordIndex <= 0 || wordIndex >= words.length) return null;

  const head = words.slice(0, wordIndex);
  const tail = words.slice(wordIndex);
  const splitAt = tail[0].s;

  const client = await db().connect();
  try {
    await client.query("begin");
    await client.query(
      `update transcript_segments
       set text = $1, end_s = $2, words = $3::jsonb, updated_at = now()
       where id = $4`,
      [
        head.map((w) => w.w).join(" ").trim(),
        splitAt,
        JSON.stringify(head),
        target.id,
      ]
    );
    await client.query(
      `update transcript_segments set idx = idx + 1
       where transcript_id = $1 and idx > $2`,
      [target.transcript_id, target.idx]
    );
    await client.query(
      `insert into transcript_segments
         (transcript_id, idx, start_s, end_s, speaker, text, words)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        target.transcript_id,
        target.idx + 1,
        splitAt,
        target.end_s,
        target.speaker,
        tail.map((w) => w.w).join(" ").trim(),
        JSON.stringify(tail),
      ]
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return listSegments(target.transcript_id);
}

export type TranscriptSearchHit = {
  transcript_id: string;
  title: string;
  segment_id: string;
  start_s: number;
  speaker: string | null;
  text: string;
  client_name: string | null;
  created_at: string;
};

/**
 * Full-text search across every transcript. 'simple' does no stemming and no
 * stop-wording, so one index serves Arabic and English alike; a plain ILIKE
 * fallback catches partial words the tokeniser would miss.
 */
export async function searchTranscripts(
  query: string,
  limit = 50
): Promise<TranscriptSearchHit[]> {
  await ensureTranscriptTables();
  const q = query.trim();
  if (!q) return [];
  const { rows } = await db().query<TranscriptSearchHit>(
    `select t.id as transcript_id, t.title, s.id as segment_id,
            s.start_s, s.speaker, s.text, c.name as client_name, t.created_at
     from transcript_segments s
     join transcripts t on t.id = s.transcript_id
     left join clients c on c.id = t.client_id
     where t.archived_at is null
       and (to_tsvector('simple', s.text) @@ plainto_tsquery('simple', $1)
            or s.text ilike '%' || $1 || '%')
     order by t.created_at desc, s.idx asc
     limit $2`,
    [q, Math.min(limit, 200)]
  );
  return rows;
}

export async function createTranscriptShare(
  transcriptId: string,
  createdBy?: string | null
): Promise<string> {
  await ensureTranscriptTables();
  const token = randomBytes(16).toString("hex");
  await db().query(
    `insert into transcript_shares (token, transcript_id, created_by)
     values ($1, $2, $3)`,
    [token, transcriptId, createdBy ?? null]
  );
  return token;
}

export async function getSharedTranscript(
  token: string
): Promise<TranscriptRecord | null> {
  await ensureTranscriptTables();
  const { rows } = await db().query<{ transcript_id: string }>(
    `select transcript_id from transcript_shares
     where token = $1 and revoked_at is null`,
    [token]
  );
  const id = rows[0]?.transcript_id;
  if (!id) return null;
  return getTranscript(id, { withSegments: true });
}

export async function revokeTranscriptShare(token: string): Promise<void> {
  await ensureTranscriptTables();
  await db().query(
    `update transcript_shares set revoked_at = now() where token = $1`,
    [token]
  );
}

export async function deleteTranscript(id: string): Promise<void> {
  await ensureTranscriptTables();
  await db().query(`delete from transcripts where id = $1`, [id]);
}
