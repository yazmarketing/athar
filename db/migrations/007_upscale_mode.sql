-- Allow 'upscale' and 'edit' as generation modes (spec §8; safe to re-run)
alter table public.generations
  drop constraint if exists generations_mode_check;

-- NOT VALID: this constraint predates 'v2v' (added in 009), so replaying the
-- migrations against a database that already holds v2v rows would fail here.
-- The constraint still applies to new rows, and 009 immediately replaces it
-- with the current, fully validated set.
alter table public.generations
  add constraint generations_mode_check
  check (mode in ('t2i', 'i2v', 't2v', 'lipsync', 'upscale', 'edit'))
  not valid;
