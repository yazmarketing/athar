import "server-only";
import { db, onceProcess } from "@/lib/db";

/**
 * A fixed vocabulary of failure modes.
 *
 * Free text alone can't be counted, and "the export is meant to be pasted into
 * an AI so we can fix the code" only works if the shape of the failures is
 * visible — eleven wardrobe misses in forty is a decision; eleven sentences is
 * a reading exercise. The note field carries the detail a vocabulary can't.
 */
export const FEEDBACK_REASONS = [
  { id: "ignored_prompt", label: "Ignored the prompt" },
  { id: "wrong_subject", label: "Wrong subject" },
  { id: "cultural_accuracy", label: "Culturally wrong (dress, setting)" },
  { id: "face_wrong", label: "Face wrong or drifted" },
  { id: "anatomy", label: "Hands / anatomy broken" },
  { id: "text_or_logo", label: "Garbled text or logo" },
  { id: "composition", label: "Composition or framing off" },
  { id: "lighting", label: "Lighting or colour off" },
  { id: "quality", label: "Soft, noisy or low quality" },
  { id: "off_brand", label: "Off-brand" },
  { id: "inconsistent", label: "Inconsistent with the other frames" },
  { id: "other", label: "Something else" },
] as const;

export type FeedbackReason = (typeof FEEDBACK_REASONS)[number]["id"];

const REASON_IDS = new Set<string>(FEEDBACK_REASONS.map((r) => r.id));

export type GenerationFeedbackRecord = {
  id: string;
  generation_id: string;
  user_id: string | null;
  rating: 1 | -1;
  reasons: string[];
  note: string;
  created_at: string;
  updated_at: string;
};

async function ensureTableUncached() {
  await db().query(`
    create table if not exists public.generation_feedback (
      id uuid primary key default gen_random_uuid(),
      generation_id uuid not null
        references public.generations (id) on delete cascade,
      user_id uuid references public.users (id) on delete set null,
      rating smallint not null check (rating in (-1, 1)),
      reasons text[] not null default '{}',
      note text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create unique index if not exists generation_feedback_one_per_user_idx
      on public.generation_feedback (generation_id, user_id)
  `);
  await db().query(`
    create index if not exists generation_feedback_created_at_idx
      on public.generation_feedback (created_at desc)
  `);
}

export const ensureFeedbackTable = onceProcess(ensureTableUncached);

/** Rate a generation. Rating again replaces the previous answer. */
export async function setFeedback(input: {
  generationId: string;
  userId: string;
  rating: 1 | -1;
  reasons?: string[];
  note?: string;
}): Promise<GenerationFeedbackRecord> {
  await ensureFeedbackTable();
  // A thumbs up carries no failure modes, whatever the client sent.
  const reasons =
    input.rating === 1
      ? []
      : Array.from(
          new Set((input.reasons ?? []).filter((r) => REASON_IDS.has(r)))
        );

  const { rows } = await db().query<GenerationFeedbackRecord>(
    `insert into generation_feedback
       (generation_id, user_id, rating, reasons, note)
     values ($1, $2, $3, $4::text[], $5)
     on conflict (generation_id, user_id) do update set
       rating = excluded.rating,
       reasons = excluded.reasons,
       note = excluded.note,
       updated_at = now()
     returning *`,
    [
      input.generationId,
      input.userId,
      input.rating,
      reasons,
      (input.note ?? "").trim().slice(0, 2000),
    ]
  );
  return rows[0];
}

export async function clearFeedback(generationId: string, userId: string) {
  await ensureFeedbackTable();
  await db().query(
    `delete from generation_feedback
     where generation_id = $1 and user_id = $2`,
    [generationId, userId]
  );
}

/** This user's own ratings, keyed by generation id, for the ids given. */
export async function getMyFeedback(
  userId: string,
  generationIds: string[]
): Promise<Record<string, GenerationFeedbackRecord>> {
  if (generationIds.length === 0) return {};
  await ensureFeedbackTable();
  const { rows } = await db().query<GenerationFeedbackRecord>(
    `select * from generation_feedback
     where user_id = $1 and generation_id = any($2::uuid[])`,
    [userId, generationIds]
  );
  return Object.fromEntries(rows.map((r) => [r.generation_id, r]));
}

/** One row of the export: the rating joined to what actually produced it. */
export type FeedbackExportRow = {
  created_at: string;
  rating: number;
  reasons: string[];
  note: string;
  rated_by: string | null;
  generation_id: string;
  mode: string;
  tier: string;
  model_endpoint: string;
  aspect: string;
  resolution: string | null;
  final_prompt: string;
  negative_prompt: string;
  input_payload: Record<string, unknown>;
  reference_count: number;
  output_url: string | null;
  client_name: string | null;
};

/**
 * Everything needed to diagnose a bad generation without opening the app: the
 * verdict, the reasons, and the exact request that produced it.
 */
export async function listFeedbackForExport(opts: {
  days?: number;
  rating?: 1 | -1 | null;
  limit?: number;
}): Promise<FeedbackExportRow[]> {
  await ensureFeedbackTable();
  const { rows } = await db().query<FeedbackExportRow>(
    `select f.created_at, f.rating, f.reasons, f.note,
            u.email as rated_by,
            g.id as generation_id, g.mode, g.tier, g.model_endpoint,
            g.aspect, g.resolution, g.final_prompt, g.negative_prompt,
            g.input_payload, g.output_url,
            coalesce(array_length(g.reference_urls, 1), 0) as reference_count,
            c.name as client_name
       from generation_feedback f
       join generations g on g.id = f.generation_id
       left join users u on u.id = f.user_id
       left join projects p on p.id = g.project_id
       left join clients c on c.id = p.client_id
      where ($1::int = 0 or f.created_at > now() - ($1::int * interval '1 day'))
        and ($2::int is null or f.rating = $2::int)
      order by f.created_at desc
      limit $3`,
    [opts.days ?? 0, opts.rating ?? null, Math.min(opts.limit ?? 500, 2000)]
  );
  return rows.map((r) => ({
    ...r,
    reference_count: Number(r.reference_count ?? 0),
  }));
}

/** Counts per reason, so the biggest failure mode is obvious at a glance. */
export async function feedbackSummary(days = 0) {
  await ensureFeedbackTable();
  const [totals, byReason, byModel] = await Promise.all([
    db().query<{ up: number; down: number }>(
      `select count(*) filter (where rating = 1)::int as up,
              count(*) filter (where rating = -1)::int as down
         from generation_feedback
        where ($1::int = 0 or created_at > now() - ($1::int * interval '1 day'))`,
      [days]
    ),
    db().query<{ reason: string; n: number }>(
      `select unnest(reasons) as reason, count(*)::int as n
         from generation_feedback
        where rating = -1
          and ($1::int = 0 or created_at > now() - ($1::int * interval '1 day'))
        group by 1 order by n desc`,
      [days]
    ),
    db().query<{ model_endpoint: string; up: number; down: number }>(
      `select g.model_endpoint,
              count(*) filter (where f.rating = 1)::int as up,
              count(*) filter (where f.rating = -1)::int as down
         from generation_feedback f
         join generations g on g.id = f.generation_id
        where ($1::int = 0 or f.created_at > now() - ($1::int * interval '1 day'))
        group by 1 order by down desc limit 10`,
      [days]
    ),
  ]);
  return {
    totals: totals.rows[0] ?? { up: 0, down: 0 },
    byReason: byReason.rows,
    byModel: byModel.rows,
  };
}
