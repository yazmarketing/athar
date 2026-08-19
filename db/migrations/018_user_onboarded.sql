-- 018 — Remember that a member finished onboarding (safe to re-run).
--
-- Completion used to live in localStorage, which is per-browser and which
-- Safari clears on its own after a week of inactivity — so the walkthrough
-- came back at almost every sign-in. It belongs with the member, not the
-- device: signing in on a phone after finishing on a laptop is still the
-- same person, and they have already been shown around.
alter table public.users
  add column if not exists onboarded_at timestamptz;
