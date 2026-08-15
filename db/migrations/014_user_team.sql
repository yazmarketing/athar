-- 014 — Store each member's team (from Google Workspace "Department").
alter table public.users add column if not exists team text;
