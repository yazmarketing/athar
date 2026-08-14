-- Allow 'upscale' and 'edit' as generation modes (spec §8; safe to re-run)
alter table public.generations
  drop constraint if exists generations_mode_check;

alter table public.generations
  add constraint generations_mode_check
  check (mode in ('t2i', 'i2v', 't2v', 'lipsync', 'upscale', 'edit'));
