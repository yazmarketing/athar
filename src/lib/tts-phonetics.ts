import "server-only";
import { db, onceProcess } from "@/lib/db";
import type { TtsPhoneticEntry } from "@/lib/types";

/**
 * Faseeh pronunciation dictionary. Mirrors
 * db/migrations/031_tts_phonetic_dictionary.sql. The LLM decides per-context
 * whether a canonical word should be respelled (see tts-director-ai.ts's
 * Pass 3) — this store only supplies candidates and enforces consistency
 * once a mapping is applied. Never a blind find/replace.
 */
async function ensureTtsPhoneticsTablesUncached() {
  await db().query(`
    create table if not exists public.tts_phonetic_dictionary (
      id uuid primary key default gen_random_uuid(),
      canonical text not null,
      respelling text not null,
      dialect text not null default 'emirati',
      notes text,
      example_context text,
      source text not null default 'manual' check (source in ('seed', 'manual', 'llm_suggested')),
      status text not null default 'active' check (status in ('active', 'pending_review', 'rejected')),
      usage_count integer not null default 0,
      created_by uuid references public.users (id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create unique index if not exists tts_phonetic_dictionary_unique_idx
      on public.tts_phonetic_dictionary (canonical, dialect)
  `);
  const { rows } = await db().query<{ n: string }>(
    `select count(*) as n from tts_phonetic_dictionary`
  );
  if (Number(rows[0]?.n ?? 0) === 0) {
    await db().query(
      `insert into public.tts_phonetic_dictionary
         (canonical, respelling, dialect, source, status, notes)
       values
         ('ورثت', 'وِرثَت', 'emirati', 'seed', 'active', 'Munsit mispronounces the plain spelling'),
         ('التي', 'اللّي', 'emirati', 'seed', 'active', 'Spoken relative pronoun'),
         ('معها', 'وياها', 'emirati', 'seed', 'active', 'Spoken "with her"'),
         ('بمفردها', 'بروحها', 'emirati', 'seed', 'active', 'Spoken "by herself"'),
         ('الشهادات', 'الشهايد', 'emirati', 'seed', 'active', 'Register-dependent — use only where colloquial fits')
       on conflict (canonical, dialect) do nothing`
    );
  }
}

export const ensureTtsPhoneticsTables = onceProcess(ensureTtsPhoneticsTablesUncached);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Cheap substring pre-scan — only dictionary entries whose canonical word
 * actually appears in this text, so Pass 3's prompt only carries relevant
 * context instead of the whole table.
 */
export async function candidatePhoneticEntries(
  text: string,
  dialect: string
): Promise<TtsPhoneticEntry[]> {
  await ensureTtsPhoneticsTables();
  const { rows } = await db().query<TtsPhoneticEntry>(
    `select * from tts_phonetic_dictionary where dialect = $1 and status = 'active'`,
    [dialect]
  );
  return rows.filter((e) =>
    new RegExp(`(?:^|[\\s،.,؛!؟])${escapeRegExp(e.canonical)}(?:[\\s،.,؛!؟]|$)`).test(` ${text} `)
  );
}

export async function listPhoneticEntries(opts: {
  dialect?: string;
  status?: TtsPhoneticEntry["status"];
} = {}): Promise<TtsPhoneticEntry[]> {
  await ensureTtsPhoneticsTables();
  const { rows } = await db().query<TtsPhoneticEntry>(
    `select * from tts_phonetic_dictionary
     where ($1::text is null or dialect = $1)
       and ($2::text is null or status = $2)
     order by canonical asc`,
    [opts.dialect ?? null, opts.status ?? null]
  );
  return rows;
}

export async function addPhoneticEntry(input: {
  canonical: string;
  respelling: string;
  dialect?: string;
  notes?: string | null;
  exampleContext?: string | null;
  source?: TtsPhoneticEntry["source"];
  status?: TtsPhoneticEntry["status"];
  createdBy?: string | null;
}): Promise<TtsPhoneticEntry> {
  await ensureTtsPhoneticsTables();
  const { rows } = await db().query<TtsPhoneticEntry>(
    `insert into tts_phonetic_dictionary
       (canonical, respelling, dialect, notes, example_context, source, status, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (canonical, dialect) do update set
       respelling = excluded.respelling,
       notes = coalesce(excluded.notes, tts_phonetic_dictionary.notes),
       updated_at = now()
     returning *`,
    [
      input.canonical.trim(),
      input.respelling.trim(),
      input.dialect ?? "emirati",
      input.notes ?? null,
      input.exampleContext ?? null,
      input.source ?? "manual",
      input.status ?? "active",
      input.createdBy ?? null,
    ]
  );
  return rows[0];
}

/** Insert an LLM-proposed mapping as pending review — never auto-applied. */
export async function suggestPhoneticEntry(input: {
  canonical: string;
  respelling: string;
  dialect: string;
  notes?: string | null;
}): Promise<void> {
  await ensureTtsPhoneticsTables();
  await db().query(
    `insert into tts_phonetic_dictionary (canonical, respelling, dialect, notes, source, status)
     values ($1, $2, $3, $4, 'llm_suggested', 'pending_review')
     on conflict (canonical, dialect) do nothing`,
    [input.canonical.trim(), input.respelling.trim(), input.dialect, input.notes ?? null]
  );
}

export async function incrementPhoneticUsage(canonical: string, dialect: string): Promise<void> {
  await ensureTtsPhoneticsTables();
  await db().query(
    `update tts_phonetic_dictionary set usage_count = usage_count + 1, updated_at = now()
     where canonical = $1 and dialect = $2`,
    [canonical, dialect]
  );
}

export async function updatePhoneticEntryStatus(
  id: string,
  status: TtsPhoneticEntry["status"]
): Promise<TtsPhoneticEntry | null> {
  await ensureTtsPhoneticsTables();
  const { rows } = await db().query<TtsPhoneticEntry>(
    `update tts_phonetic_dictionary set status = $2, updated_at = now() where id = $1 returning *`,
    [id, status]
  );
  return rows[0] ?? null;
}
