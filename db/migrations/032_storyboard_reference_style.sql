-- Storyboard reference style contract + board-level render engine.
--
-- reference_style: what the attached references ARE, analyzed once by a
-- vision model (medium, technique, palette, lighting, whether they carry the
-- cast) and injected into every frame render. The pixels alone get
-- re-interpreted per render; the written contract is what makes the same
-- references produce the same look on every board.
--
-- image_model: which engine renders the frames — null/'seedream' for the
-- tiered Seedream registry, or 'nano-banana' / 'nano-banana-pro' (Gemini).
-- Nano Banana Pro holds style across references best.

alter table public.storyboards
  add column if not exists reference_style jsonb;

alter table public.storyboards
  add column if not exists image_model text;
