-- 015 — Remove the comments feature entirely (safe to re-run).
-- The index goes with the table, but drop it explicitly first so partial
-- earlier states also converge cleanly.
drop index if exists public.generation_comments_generation_id_idx;
drop table if exists public.generation_comments;
