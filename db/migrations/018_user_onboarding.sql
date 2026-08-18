-- 018 — Remember onboarding per USER, not per browser.
--
-- Completion used to live only in localStorage, so the walkthrough came back
-- on every new browser, every private window, and any time storage was
-- cleared — which read as "it shows at every login". The server row is now
-- the source of truth; localStorage is only a fast path to avoid a fetch.
alter table public.users
  add column if not exists onboarded_at timestamptz;
