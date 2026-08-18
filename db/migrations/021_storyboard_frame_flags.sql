-- 021 — Per-frame control over consistency.
--
-- Two failures this fixes. First, the key-frame anchor held identity but also
-- dragged composition, so an insert or a macro came back as a near-copy of the
-- establishing shot; frames can now opt out. Second, a storyboard beat is
-- sometimes deliberately *not* an image — a black screen before the first
-- sound — and there was no way to say so. Idempotent.
alter table public.storyboard_frames
  add column if not exists lock_to_anchor boolean not null default true;
alter table public.storyboard_frames
  add column if not exists is_blank boolean not null default false;
