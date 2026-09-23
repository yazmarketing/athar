# Production upgrade verification — 9 September 2026

Implemented directly in the Athar working tree, preserving the pre-existing Voice Director and library work.

## Delivered

- Graphite studio theme, quieter typography, reorganized navigation, responsive home and a dedicated Director workspace.
- Editable brief-to-film workflow, source uploads and folder import, Athar image/video/voice library import, scene editing and locks, revision history, recoverable browser drafts, private media, cancellation and 1080p MP4 exports.
- Four rendered visual styles; Arabic/English text shaping; source audio and optional looping music or a voice track that plays once.
- Astra Responses client for production intelligence, vision scoring and storyboards; explicit provider failures instead of silent substitutions.
- Director public factual/cultural research with source links, supplied cultural references, and conservative treatment of unobserved footage.
- Country-specific visual guidance that preserves the brief's actual casting, wardrobe, place and era.
- Sunburst image generation/editing integration with references and usage-based cost handling.
- Background image jobs now reach the captured Smart ranking/finishing/brand-review path once per active browser batch. Keep the tab open for this finishing step; it is not a persistent server-side finishing queue.

## Checks completed

- 332 tests across 38 test files passed.
- TypeScript passed.
- The Director implementation and updated Studio/Home/layout files passed lint.
- `npm run build -- --webpack` passed. Turbopack's build worker could not bind its internal local port in this environment, so the supported alternate compiler was used for build verification.
- Four actual six-second 1080×1920 H.264/AAC motion exports were rendered and probed. Their Arabic thumbnail frames were visually inspected. These are explicitly manual verification fixtures, not live model results.
- Actual mixed image/video/audio rendering, detached worker completion, duplicate-run rejection, cancellation, owner access, media ranges, stale edits and bounded library downloads are covered by tests.
- Existing unrelated React-hook lint errors remain in older components; this is not a claim that repository-wide lint is clean. Local generated build/backup directories are now excluded from lint.

## External checks still pending

Live Responses generation and Sunburst model/schema readiness could not be verified. The network attempts failed in the sandbox, and the escalated retries did not receive completed approval. No successful paid generation or database migration occurred during this verification.

The running local app reached Google sign-in. The authenticated browser workflow could not be completed because it required the user's Google authentication, and browser control subsequently timed out. Static component fixtures were prepared separately, but browser policy prevented opening the local HTML files. No authentication bypass was added.

Sunburst's cost records require a nullable `generations.cost`. The read-only preflight prevents a paid request when the existing schema is incompatible. Apply `db/migrations/033_generation_cost_nullable.sql` through the normal database migration process if needed; it was not applied here.

Director is a single-host local-disk implementation. Folder import is a one-time selection. Source understanding currently uses metadata and representative frames, not exhaustive video indexing. Written narration direction is not speech synthesis; import a completed Voice track or upload audio. Full infrastructure and workflow limits are in [director.md](./director.md).

Preview the app at `http://localhost:3000`, sign in, then open Director. A local, silent Arabic/English motion fixture is saved at `.athar/previews/athar-motion-kinetic.mp4`.
