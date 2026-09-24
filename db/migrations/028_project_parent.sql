-- Cinema Studio: projects can nest one level (or more) as subfolders.
-- A deleted parent orphans its children back to top level rather than
-- cascading — folders organise work, they must never destroy it.
alter table public.projects
  add column if not exists parent_id uuid
    references public.projects (id) on delete set null;

create index if not exists projects_parent_idx
  on public.projects (parent_id);
