# YAZ Motion — Current State Audit

**Audit date:** 12 August 2026  
**Spec reference:** `YAZ_Motion_Cursor_Development_Specification_v2.docx`  
**Auditor:** Cursor (Appendix C first task)  
**Repository:** `/Users/akhilaanil/Downloads/dev/yaz-motion`

This document records what is **Confirmed Complete**, **Partial**, **Missing**, or **Needs Verification** in the repository. The owner-confirmed baseline is the starting assumption; file evidence and command output below are the implementation truth.

---

## Executive summary

| Area | Verdict |
|---|---|
| Image studio core | **Confirmed Complete** — generation, library, detail, Assistant, Variations |
| Persistence (Postgres + Spaces) | **Confirmed Complete** |
| Provider integration (ModelArk primary) | **Confirmed Complete** for image; video path exists but not production-grade |
| Auth gate | **Partial** — NextAuth login + middleware; roles not enforced on routes yet |
| Projects / Brand Kits | **Complete** — Projects + filtering, Brand Kits + prompt injection |
| Durable async jobs | **Missing** |
| Advanced image/video tools | **Missing** (Assistant chips only) |
| Automated tests | **Complete** — Vitest, 12 unit tests (`npm test`): prompt builder, model registry, Seedance payload rules |
| Lint | **Pre-existing failures** (6 ESLint errors) |
| TypeScript / build | **Pass** |

**Recommended next slice:** **Phase 11 — Spaces / workflow automation** (deferred per spec gates) or dedicated Relight/portrait tools when a production-quality provider is chosen.

## Advanced image production (Phase 6 — complete)

| Item | Status | Files |
|---|---|---|
| Upscale models in registry | Confirmed Complete | `src/config/models.ts` — `UPSCALE_MODELS` (Seedream i2i creative / precision) |
| `POST /api/upscale` | Confirmed Complete | Seedream i2i → Spaces copy → new `generations` row with lineage |
| Upscale dialog (mode, 2×/4×) | Confirmed Complete | `src/components/upscale-dialog.tsx` |
| Background removal | Confirmed Complete | `POST /api/background/remove` (Seedream edit, white backdrop) + image-detail action; result saved as `mode='edit'` with lineage |
| `mode` check includes `upscale`/`edit` | Confirmed Complete | `db/migrations/007_upscale_mode.sql`; auto-relaxed on first use |
| Relight / camera / portrait-skin | Prompt-based | Assistant chips only — dedicated provider tools deferred until quality is validated (per spec "based on provider quality") |

## Batch Jobs (Phase 7 — complete, pragmatic scope)

| Item | Status | Files |
|---|---|---|
| Library multi-select | Confirmed Complete | `studio.tsx` — Select toggle, card checkmarks, batch action bar |
| Batch upscale (one config → many assets) | Confirmed Complete | `upscale-dialog.tsx` — sequential run, per-item failure count, aggregate progress (spec 8.14) |
| Batch image outputs (1–4) | Confirmed Complete | pre-existing create-dock `numOutputs` |
| Batch variations (2–4) | Confirmed Complete | pre-existing variations panel |
| Dedicated batch-jobs queue/table | Deferred | Current batches run client-orchestrated; durable batch queue when volumes justify it |

## QC gate + approval (Phase 8 — complete)

| Item | Status | Files |
|---|---|---|
| Pass / Revise / Reject states | Confirmed Complete | `PATCH /api/generations/[id]` — `qc_status`; `approved_by` stamped on pass |
| Client-ready flag | Confirmed Complete | same route — `client_ready` |
| Review controls in image + video detail | Confirmed Complete | `src/components/qc-controls.tsx` |
| QC badges on Library cards | Confirmed Complete | `studio.tsx` |
| Library filter by QC status / client-ready | Confirmed Complete | `studio.tsx` — status dropdown next to search |
| Reviewer notes | Confirmed Complete | existing comments system |
| QC changes audited | Confirmed Complete | `audit_log` entries |

## Usage & cost dashboard (Phase 9 — complete)

| Item | Status | Files |
|---|---|---|
| `GET /api/usage` aggregates | Confirmed Complete | totals, by type/model/user/project, daily (30d) |
| Usage view in sidebar | Confirmed Complete | `src/components/usage-panel.tsx` — stat cards, daily bars, breakdowns |
| No billing UI | Confirmed | Read-only internal visibility per spec |

## Roles + audit log (Phase 10 — complete)

| Item | Status | Files |
|---|---|---|
| Viewer cannot run generation jobs | Confirmed Complete | `src/lib/authz.ts` — `requireCreator` on `/api/generate`, `/api/upscale`, `/api/background/remove`, `/api/jobs/[id]/retry`, `/api/upload` |
| Role shown in sidebar | Confirmed Complete | `sidebar-user.tsx` |
| Audit log table | Confirmed Complete | `db/migrations/008_audit_log.sql`; auto-create on first use |
| Audited actions | Confirmed Complete | generation delete, QC change, client-ready change, job retry |
| Audit trail UI | Confirmed Complete | Usage view — recent 50 entries |
| Admin user-management UI | Confirmed Complete | `GET/PATCH /api/users` (admin only) + Team dialog in sidebar (`team-dialog.tsx`) — change roles, enable/disable members; self-demotion blocked; changes audited |

## Deferred by spec design (Phases 11–12)

- **Phase 11 — Spaces / node-based workflow automation**: spec gates this "after individual tool APIs are stable".
- **Phase 12 — Custom characters/products/styles, Agents, Audio, Design, 3D**: spec marks these "only after image/video production is mature".

## Video workspace (Phase 5 — complete)

| Item | Status | Files |
|---|---|---|
| Video detail view (player, prompt, settings) | Confirmed Complete | `src/components/video-detail.tsx` |
| Comments on videos | Confirmed Complete | reuses `/api/generations/[id]/comments` |
| Favorite / delete / MP4 download / move to project | Confirmed Complete | `video-detail.tsx` + existing APIs |
| Open video detail from gallery cards | Confirmed Complete | `studio.tsx` — `openDetail` routes by type |
| Image → video (first frame) | Confirmed Complete | `POST /api/generate` — `sourceImageUrl` switches to i2v model, passed to Seedance |
| Create-video lineage | Confirmed Complete | `source_generation_id` + `source_image_url` in `input_payload`; source thumbnail links back in video detail |
| First-frame chip in video dock | Confirmed Complete | `studio.tsx` — removable, set by "Create video" |
| i2v retry keeps first frame | Confirmed Complete | `POST /api/jobs/[id]/retry` |
| Trim / extend / lip-sync / video upscale | Missing | Later — provider support varies |

## Async video jobs (Phase 4 — complete)

| Item | Status | Files |
|---|---|---|
| `generation_jobs` table | Confirmed Complete | `db/migrations/006_generation_jobs.sql`; auto-create on first use |
| Seedance create/status split (no in-process polling) | Confirmed Complete | `src/lib/byteplus-server.ts` — `arkCreateVideoTask`, `arkGetVideoTask` |
| t2v submit returns durable job (202) | Confirmed Complete | `POST /api/generate` |
| Job status + finalize (Spaces copy, `generations` insert) | Confirmed Complete | `GET /api/jobs/[id]`, `src/lib/generations-store.ts` |
| Retry failed jobs | Confirmed Complete | `POST /api/jobs/[id]/retry` |
| Refresh-safe progress cards in studio | Confirmed Complete | `src/components/studio.tsx` — restore via `GET /api/jobs`, 5s polling |
| Stale-job timeout (30 min) | Confirmed Complete | jobs status route |
| fal video fallback in async path | Missing | Deliberate — Seedance-only per spec Phase 4 |

## Brand Kits (Phase 3 — complete)

| Item | Status | Files |
|---|---|---|
| `brand_kits` table | Confirmed Complete | `db/migrations/005_brand_kits.sql`; auto-create on first use |
| APIs | Confirmed Complete | `GET/POST /api/brand-kits`, `GET/PATCH /api/brand-kits/[id]` |
| Sidebar picker + create dialog | Confirmed Complete | `src/components/brand-kit-picker.tsx` |
| Prompt injection (server-side) | Confirmed Complete | `/api/generate` merges kit `brand_tokens` + `negative_additions` |
| `brand_kit_id` stamped on generations | Confirmed Complete | insert in `/api/generate` |
| Kit edit UI | Confirmed Complete | `brand-kit-picker.tsx` — pencil icon on the active kit opens an edit dialog (name, client, tokens, negatives) via `PATCH /api/brand-kits/[id]` |
| Kit reference images | Missing | Later — reference assets per kit |

---

## Verification commands (12 Aug 2026)

| Check | Result |
|---|---|
| `npm run lint` | **FAIL** — 6 errors, 1 warning (`react-hooks/set-state-in-effect` in `studio.tsx`, `image-chat.tsx`, `image-detail.tsx`, `prompt-editor.tsx`) |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** — all 10 app routes compile |
| Unit / integration tests | **None** — no `*.test.ts` / `*.spec.ts` files in repo |

---

## Stack & tooling

| Item | Status | Evidence |
|---|---|---|
| Next.js 16 | Confirmed Complete | `package.json` → `next@16.3.0`; build output confirms App Router |
| React 19 | Confirmed Complete | `package.json` → `react@19.2.8` |
| Tailwind v4 | Confirmed Complete | `src/app/globals.css`, `@tailwindcss/postcss` |
| shadcn/ui | Confirmed Complete | `src/components/ui/*` |
| Lucide icons | Confirmed Complete | Used across components |
| TypeScript | Confirmed Complete | Strict project; `tsc --noEmit` passes |
| next-themes | Confirmed Complete | `src/components/theme-provider.tsx`, `src/app/layout.tsx` |
| DevTools badge hidden | Confirmed Complete | `next.config.ts` → `devIndicators: false` |

**Files that must NOT be overwritten without cause:** `src/components/studio.tsx`, `src/components/image-chat.tsx`, `src/components/variations-panel.tsx`, `src/components/image-detail.tsx`, `src/config/models.ts`, `src/app/api/generate/route.ts`, `src/lib/byteplus-server.ts`, `db/schema.sql`.

---

## Application shell & navigation

| Requirement | Status | Route / component | Notes |
|---|---|---|---|
| Single-page studio shell | Confirmed Complete | `src/app/page.tsx` → `Studio` | No separate `/library` route; views are state-driven |
| Home dashboard | Confirmed Complete | `src/components/studio.tsx` (`view === "home"`) | Greeting, search, quick chips, recent grid |
| Library | Confirmed Complete | `studio.tsx` (`view === "library"`) | Search + full gallery |
| Create dock | Confirmed Complete | `studio.tsx` (`view === "create"`) | Bottom dock for t2i/t2v |
| Image Generator | Confirmed Complete | Create dock + `mode === "t2i"` | Model, aspect, resolution, batch count, attach refs |
| Video Generator | Partial | Create dock + `mode === "t2v"` | UI + API path exist; no job progress, no video detail workspace |
| Assistant | Confirmed Complete | `src/components/image-chat.tsx` | Create/edit, refs, chips, improve prompt, variations entry |
| Variations | Confirmed Complete | `src/components/variations-panel.tsx` | Strength, 2–4 outputs, compare grid, scrollable source prompt |
| Sidebar footer — Connections | Confirmed Complete | `studio.tsx` + `GET /api/status` | ModelArk / Postgres / Spaces health |
| Sidebar footer — Theme toggle | Confirmed Complete | `studio.tsx` + `next-themes` | Light/dark; `:root` light tokens in `globals.css` |
| Custom favicon | Confirmed Complete | `src/app/icon.tsx` | Gold “Y”; default `favicon.ico` removed |
| Projects nav | Missing | — | Not in sidebar |
| Brand Kits nav | Missing | — | — |
| Batch Jobs / Upscaler / QC | Missing | — | — |

---

## Image generation & editing

| Requirement | Status | API / component | DB / provider | Gaps |
|---|---|---|---|---|
| Text-to-image | Confirmed Complete | `POST /api/generate` | `generations` + Spaces | — |
| Image-to-image (reference) | Confirmed Complete | Same + `referenceUrls` | Seedream unified API via `byteplus-server.ts` | No explicit reference *roles* (character/style/product) |
| Multi-reference (up to 4) | Confirmed Complete | Create dock + `POST /api/upload` | `reference_urls[]` | Role metadata not stored |
| Batch outputs (1–4) | Confirmed Complete | `numOutputs` loop in generate route | One row per output | Sequential, not parallel |
| Structured prompt builder | Confirmed Complete | `src/lib/prompt.ts` | Stored in `input_payload` | — |
| Prompt editor (⌘E) | Confirmed Complete | `src/components/prompt-editor.tsx` | — | — |
| AI prompt improve | Confirmed Complete | `POST /api/prompt/improve` | `ARK_CHAT_MODEL` via `arkChat()` | Requires chat endpoint env |
| Reproduce (same seed) | Confirmed Complete | Card hover + detail | `seed` passed to generate | No `parent_generation_id` lineage link |
| Vary | Confirmed Complete | `variations-panel.tsx` + `submitVary` | Reference = source `output_url` | — |
| Assistant edit (prompt-based) | Confirmed Complete | `image-chat.tsx` → `submitEdit` | New generation per edit | Not a dedicated Image Editor page |
| Tool chips (Relight, Camera, Soft skin) | Partial | `image-chat.tsx` `TOOL_CHIPS` | Prompt nudges only | No dedicated capability routes or upscale |
| Cost per generation | Confirmed Complete | Saved in `generations.cost` | Shown in detail + card hover | Removed from create dock (by design) |
| Mask / inpaint / retouch | Missing | — | — | — |
| Background tools | Missing | — | — | — |
| Upscale (creative / precision) | Missing | Registry mentions fal upscale | No route/UI | — |
| Custom Characters / Products / Styles | Missing | Attach refs only | — | — |
| Image description from upload | Missing | — | — | — |

---

## Video

| Requirement | Status | Evidence | Gaps |
|---|---|---|---|
| Model registry (Seedance) | Confirmed Complete | `src/config/models.ts` T2V, I2V tiers | VERIFY slugs in ModelArk console |
| t2v API path | Partial | `generate/route.ts` + `arkGenerateVideo()` | Synchronous poll inside request (up to ~280s); `maxDuration = 300` |
| Video Generator UI | Partial | Create dock t2v mode | No progress UI; user must wait on page |
| i2v from detail | Partial | “Create video” in `image-detail.tsx` | Opens t2v with prompt prefilled; no first-frame asset wiring verified end-to-end |
| Durable `generation_jobs` | Missing | — | Job lost on refresh/navigation during long render |
| Video detail / timeline | Missing | — | — |
| Camera presets (8 named) | Missing | Assistant “Camera” chip only | — |
| Lip-sync / video upscale | Missing | Registry stubs for fal | No UI/API |

---

## Library, detail & collaboration

| Requirement | Status | Files | Notes |
|---|---|---|---|
| Gallery feed | Confirmed Complete | `GET /api/generations` | Ordered by `created_at desc` |
| Search (client-side) | Confirmed Complete | `studio.tsx` `filtered` | Prompt/mode/tier filter |
| Image detail panel | Confirmed Complete | `src/components/image-detail.tsx` | Full-screen overlay |
| Share (URL, prompt, social, email) | Confirmed Complete | `image-detail.tsx` | — |
| Download PNG/JPEG/WebP | Confirmed Complete | `GET /api/download` + client encode | — |
| Favorite | Confirmed Complete | `PATCH /api/generations/[id]` | `is_favorite` column + migration `001` |
| Delete | Confirmed Complete | `DELETE /api/generations/[id]` | Hard delete |
| Comments / team notes | Confirmed Complete | `GET/POST .../comments` | Migration `002`; author defaults to “Studio” |
| Use prompt → Image Generator | Confirmed Complete | `image-detail.tsx` + `openTool` | — |
| Edit in Assistant | Confirmed Complete | `openAssistant(g)` | — |
| Settings metadata (cost, seed, tier) | Confirmed Complete | Detail “Settings” section | — |
| Generation lineage (`parent_generation_id`) | Missing | — | Schema has no column; vary/edit lineage implicit via refs only |
| Projects / folders | Missing | `project_id` column exists but unused | — |
| @mentions / reply / resolve comments | Missing | — | Flat comment list only |
| Universal asset picker | Missing | — | — |

---

## API routes

| Route | Status | File | Preserve |
|---|---|---|---|
| `POST /api/generate` | Confirmed Complete | `src/app/api/generate/route.ts` | **Yes** |
| `GET /api/generations` | Confirmed Complete | `src/app/api/generations/route.ts` | **Yes** |
| `PATCH /api/generations/[id]` | Confirmed Complete | `src/app/api/generations/[id]/route.ts` | **Yes** |
| `DELETE /api/generations/[id]` | Confirmed Complete | Same | **Yes** |
| `GET/POST .../comments` | Confirmed Complete | `src/app/api/generations/[id]/comments/route.ts` | **Yes** |
| `POST /api/upload` | Confirmed Complete | `src/app/api/upload/route.ts` | **Yes** |
| `POST /api/prompt/improve` | Confirmed Complete | `src/app/api/prompt/improve/route.ts` | **Yes** |
| `GET /api/download` | Confirmed Complete | `src/app/api/download/route.ts` | **Yes** |
| `GET /api/status` | Confirmed Complete | `src/app/api/status/route.ts` | **Yes** |
| `/api/projects`, `/api/jobs`, `/api/batch-jobs`, `/api/usage` | Missing | — | Add by feature |

**Authorization:** No route checks user/session. All endpoints are open if the app is deployed.

---

## Database & storage

| Item | Status | Location | Notes |
|---|---|---|---|
| `generations` table | Confirmed Complete | `db/schema.sql` | Full metadata; `user_id` / `project_id` nullable, unused |
| `generation_comments` | Confirmed Complete | `db/schema.sql` + migration `002` | — |
| `assets` table | Partial | `db/schema.sql` | Defined; generate route writes to `generations.output_url` directly — `assets` rows not populated |
| `is_favorite` column | Confirmed Complete | `db/migrations/001_is_favorite.sql` | Additive migration |
| `generation_jobs` | Confirmed Complete | `db/migrations/006_generation_jobs.sql` | Durable video jobs (Phase 4) |
| `users`, `projects`, `brand_kits` | Confirmed Complete | migrations `003`–`005` | — |
| DigitalOcean Postgres client | Confirmed Complete | `src/lib/db.ts` | Lazy pool, SSL for DO |
| DigitalOcean Spaces upload | Confirmed Complete | `src/lib/storage.ts` | Public-read objects; optional CDN URL |
| Migrations folder | Partial | `db/migrations/` | Manual SQL files; no migration runner in npm scripts |

---

## Provider integration

| Item | Status | File | Notes |
|---|---|---|---|
| Model registry (capability + tier) | Confirmed Complete | `src/config/models.ts` | Single source of truth; Seedream + Seedance (BytePlus only) |
| BytePlus image API | Confirmed Complete | `src/lib/byteplus-server.ts` | `arkGenerateImage` |
| BytePlus video API | Confirmed Complete | Same | `arkGenerateVideo` with in-process polling |
| BytePlus chat (prompt improve) | Confirmed Complete | Same | `arkChat`; needs `ARK_CHAT_MODEL` |
| fal.ai | Removed | — | Dropped 14 Aug 2026 — upscale + background removal now Seedream i2i |
| Provider adapter interface (spec §07) | Partial | Ad-hoc functions, not formal `AIProviderAdapter` | Works; refactor later if needed |
| Secrets server-side only | Confirmed Complete | All `process.env.*` in server files | No keys in client bundle |

**Env vars (from `.env.example`):** `ARK_API_KEY`, `DATABASE_URL`, `DO_SPACES_*`, `ARK_CHAT_MODEL`, `ARK_BASE_URL`, `DO_SPACES_CDN_URL`.

---

## Security & platform

| Requirement | Status | Notes |
|---|---|---|
| Auth gate | Missing | No NextAuth, middleware, or login page |
| Roles (Admin / Creator / Viewer) | Missing | — |
| Route authorization | Missing | Any client can call all APIs |
| Upload validation | Partial | `upload/route.ts` checks file presence/type/size | No auth |
| Audit log | Missing | — |
| Billing / checkout | Confirmed absent | Per spec — correct |
| Internal usage dashboard | Missing | Cost stored per generation only |

---

## UI/UX (spec §21)

| Requirement | Status | Notes |
|---|---|---|
| Magnific-inspired workflow (not trade dress) | Confirmed Complete | Dark gold identity, sidebar + dock |
| Light/dark theme | Confirmed Complete | Theme toggle + CSS tokens |
| Progressive disclosure (advanced prompt fields) | Confirmed Complete | Collapsible details in create dock |
| Job state survives navigation | Partial | Image: synchronous OK. Video: **fails** — long request tied to open tab |
| Output card actions | Partial | Open, Vary, Reproduce on hover | Missing: Move to Project, Upscale, Rename |
| Cost hidden in create dock | Confirmed Complete | Shown in detail/hover only |

---

## Known bugs & risks

1. **No auth** — biggest risk for any non-local deployment.
2. **Lint errors** — 6 pre-existing `react-hooks/set-state-in-effect` violations; should be fixed before large refactors.
3. **No automated tests** — regressions rely on manual QA.
4. **Video timeout** — 300s API route limit; no durable job if user navigates away.
5. **Lineage gap** — no `parent_generation_id`; hard to trace edit → variation → video chains in DB.
6. **`assets` table unused** — outputs only on `generations.output_url`.
7. **Sequential batch generation** — Variations (3×) run serially in one HTTP request; slow but functional.
8. **Public Spaces URLs** — outputs are public-read; acceptable for internal MVP but review for client-facing rollout.

---

## Appendix A parity snapshot (spec)

Legend: ✅ Complete · 🟡 Partial · ❌ Missing

| Area | Feature | Status |
|---|---|---|
| Platform | Auth / roles | ❌ |
| Platform | Dashboard / recent creations | ✅ |
| Platform | Projects / folders | 🟡 (Library only) |
| Platform | Generation history + lineage | 🟡 |
| Platform | Async jobs | ✅ (durable video jobs + retry) |
| Image | Text-to-image | ✅ |
| Image | Image-to-image / multi-ref | 🟡 |
| Image | Prompt enhance | ✅ |
| Image | AI editor / mask / upscale | 🟡 / ❌ |
| Image | Variations | ✅ |
| Video | t2v / i2v pipeline | 🟡 |
| Assistant | Conversational assistant | 🟡 |
| Collaboration | Comments | ✅ |
| Admin | Connection status | 🟡 |
| Admin | Usage dashboard | 🟡 (cost saved; no dashboard) |

---

## Auth (Phase 1 — complete)

| Item | Status | Files |
|---|---|---|
| Login page | Confirmed Complete | `src/app/login/page.tsx`, `src/components/login-form.tsx` |
| NextAuth (credentials + optional Google) | Confirmed Complete | `src/lib/auth-options.ts`, `src/app/api/auth/[...nextauth]/route.ts` |
| Middleware (protect `/` + `/api/*`) | Confirmed Complete | `src/middleware.ts` — API returns 401 JSON |
| Users table | Confirmed Complete | `db/migrations/003_users.sql`, auto-create on first login |
| Session in studio | Confirmed Complete | `SidebarUser` — email + sign out |
| `user_id` on new generations | Confirmed Complete | `POST /api/generate` |
| Comment author from session | Confirmed Complete | `POST .../comments` |
| Role enforcement (viewer cannot generate) | Missing | Phase 10 |

**Env vars:** `AUTH_SECRET`, `AUTH_INTERNAL_PASSWORD`, `AUTH_ALLOWED_EMAILS` and/or `AUTH_ALLOWED_DOMAINS`, optional `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, optional `AUTH_ADMIN_EMAIL`.

---

## Recommended next task

**Phase 5 — Reference images / consistency locks**

---

## Audit maintenance

Update this file after each roadmap slice:

- Change status for completed requirements
- Link new routes/components/migrations
- Record new lint/test/build results
- List new risks or resolved gaps

---

*Generated per YAZ Motion Cursor Development Specification v2, Appendix C.*
