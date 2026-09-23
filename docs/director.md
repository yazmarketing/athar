# Director: local production workspace

Director turns a brief and source media into an editable scene plan and an actual 1080p MP4. The first implementation supports social videos, source-grounded event edits and designed motion title cards. It does not generate new footage, synthesize written narration, publish to social platforms, watch a desktop folder continuously or replace a full professional timeline editor.

## What runs today

- Create a project, upload source images/video/audio, set language, locale, cultural notes, brand name, accent, format and visual style.
- Import completed images, videos and voice tracks directly from Athar’s shared workspace library. Imports resolve existing records, accept only configured Athar storage, reject redirects and bound downloaded bytes. Voice imports retain the script as source evidence and default to playing once.
- Ask the configured directing model to plan or revise scenes using the brief, metadata and representative source images. The planner can research uncertain public cultural/local facts with web search, and displays consulted source links; private briefs and scripts must not be copied into public search queries. Pure supplied-text motion treatments do not need research. Locked scenes are restored exactly at their original scene positions. Representative images do not provide full-video understanding; factual/source review remains required.
- Manually edit the same scene data without a model. An edit stores source ID, in point, duration, text, notes, transition and fit. Version snapshots preserve previous scene/settings states. Saves with a stale supplied version fail instead of replacing a newer edit. The browser keeps an owner-scoped draft across tool navigation and reload; conflicting drafts can be downloaded for recovery.
- Compose videos with bundled-font Arabic/English text, animated image/title-card backgrounds, source footage, fades, available source audio and an optional looped soundtrack. Source footage is trimmed precisely to the selected time range. Fades are through dark; these are not overlapping dissolves.
- Render an H.264/yuv420p MP4 with AAC audio at 1080×1920, 1920×1080, 1080×1080 or 1080×1350. Verify dimensions and duration. Loudness normalization is applied; it is not a measured compliance certificate.
- Stream private assets, thumbnails and exports through owner-authenticated URLs with byte-range and HEAD support. No local paths or public storage URLs appear in API projects.
- Keep creative, factual and typography checks explicitly pending. Written narration is direction only; export checks warn if it has not been supplied as audio.

Limits: 100 MB per uploaded file, 50 assets, 24 scenes and 90 seconds per finished edit. Source files can be longer, but each selected range must fit its actual duration. Supported uploads: JPEG, PNG, WebP, MP4, MOV, WebM, MP3, WAV, M4A, AAC and OGG. Folder selection is a one-time import of files, not a continuing connection.

## Configuration and deployment scope

This implementation is for a **self-hosted, single-host Node application with persistent writable local disk**. Projects and source media live under `.athar/director` (git-ignored); `ATHAR_DIRECTOR_ROOT` may select another persistent directory. Back up the entire directory together. Project metadata writes use a per-project filesystem lock and atomic rename. Originals are retained when removed from the active project so historical work is not destructively erased; no retention/purge interface is provided yet.

`OPENAI_API_KEY` enables planning. `OPENAI_DIRECTOR_MODEL` defaults to `gpt-6-astra`; `OPENAI_BASE_URL` may override the `/v1` API base. The planner uses Responses with structured JSON and thumbnail image inputs. A configured key is not a claim of model entitlement. Provider refusal, quota or unavailable-model errors remain visible; there is no silent model substitution. The export records the model returned by the provider. No paid generation is needed to use manual editing or rendering.

The server must ship the source `src/lib/director` and `src/lib/director-types.ts`, `scripts/director-worker.cjs`, the installed TypeScript runtime compiler, FFmpeg static binary, Sharp and bundled `public/fonts` directories. The worker bootstrap compiles TypeScript in memory. A production install that omits the TypeScript package will not support this worker. FFmpeg must include libx264, AAC, libass and the relevant input codecs.

The route launches a detached Node worker, so closing or navigating the browser does not stop production. A project reserves one run at a time. Persisted progress and cancellation are polled from disk; cancellation aborts provider requests and FFmpeg processing. Cancelling after provider work began cannot promise reversal of provider charges. A machine shutdown or container replacement can stop a run; its next read marks it interrupted and preserves the edit/previous outputs rather than silently replaying a paid request. This is not a distributed job queue or serverless deployment solution. Multiple independent application hosts without shared persistent storage are unsupported.

Uploads currently buffer one file in the app process. Do not raise the size cap without implementing multipart/resumable storage ingestion and suitable infrastructure limits. Large event-footage libraries, full scene indexing/transcription, richer audio ducking, real cross-dissolves, arbitrary graphic layout tools and a persistent desktop-folder companion are later production slices.

## API

- `GET/POST /api/director/projects`
- `GET/PATCH /api/director/projects/:id`
- `POST /api/director/projects/:id/assets` — multipart `file`
- `DELETE /api/director/projects/:id/assets/:assetId`
- `POST /api/director/projects/:id/library` — `{source: "generation" | "voice", sourceId}`
- `POST /api/director/projects/:id/run` — `{instruction?, render?}`, default render true
- `POST /api/director/projects/:id/render`
- `POST /api/director/projects/:id/cancel`
- `GET/HEAD /api/director/projects/:id/media/:mediaId` — optional `thumbnail=1` or `download=1`

All reads and media require the owning signed-in user. All writes additionally require creator/admin role. Admin role does not grant access to someone else's private Director projects. No public share link is created.

## Verification

`npx vitest run test/director-production.test.ts test/director-http.test.ts` covers owner isolation, serialized persistence, source-range constraints, exact scene locks, interrupted-run behavior, upload byte validation, real detached render/cancellation, private playback ranges, and a real mixed Arabic/English image/video/soundtrack 1080p export. Set `DIRECTOR_KEEP_TEST_RENDER` to a temporary output directory to retain the visual fixture for inspection. These tests do not spend provider credits or establish subjective creative quality.
