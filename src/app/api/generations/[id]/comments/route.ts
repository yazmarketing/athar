import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function ensureCommentsTable() {
  await db().query(`
    create table if not exists public.generation_comments (
      id uuid primary key default gen_random_uuid(),
      generation_id uuid not null references public.generations (id) on delete cascade,
      author text not null default 'Studio',
      body text not null,
      created_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create index if not exists generation_comments_generation_id_idx
      on public.generation_comments (generation_id, created_at asc)
  `);
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    await ensureCommentsTable();

    const { rows } = await db().query(
      `select id, generation_id, author, body, created_at
       from generation_comments
       where generation_id = $1
       order by created_at asc`,
      [id]
    );

    return NextResponse.json({ comments: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = (await req.json()) as { body?: string; author?: string };
    const text = body.body?.trim() ?? "";
    if (!text) {
      return NextResponse.json({ error: "Comment text is required" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json(
        { error: "Comment must be 2000 characters or less" },
        { status: 400 }
      );
    }

    const sessionUser = await getSessionUser();
    const author = (
      sessionUser?.name?.trim() ||
      sessionUser?.email?.trim() ||
      body.author?.trim() ||
      "Studio"
    ).slice(0, 80);

    await ensureCommentsTable();

    const exists = await db().query(
      `select id from generations where id = $1`,
      [id]
    );
    if (!exists.rows[0]) {
      return NextResponse.json({ error: "Generation not found" }, { status: 404 });
    }

    const { rows } = await db().query(
      `insert into generation_comments (generation_id, author, body)
       values ($1, $2, $3)
       returning id, generation_id, author, body, created_at`,
      [id, author, text]
    );

    return NextResponse.json({ comment: rows[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
