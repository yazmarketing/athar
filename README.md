# Athar

Internal AI film & image studio. **BytePlus ModelArk (Seedream/Seedance) is the only provider.**

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · DigitalOcean (Managed Postgres + Spaces) · BytePlus ModelArk API

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create DigitalOcean resources** at [digitalocean.com](https://www.digitalocean.com):
   - A **Managed Postgres** database (Databases → Create). Then apply the schema: `psql "$DATABASE_URL" -f db/schema.sql`. This creates the `generations` and `assets` tables.
   - A **Space** (Spaces Object Storage → Create) for persisted outputs, plus a Spaces access key (API → Spaces Keys).

3. **Get a BytePlus ModelArk API key** — BytePlus console → ModelArk → API Key Management. Also activate the Seedream/Seedance models you plan to use (ModelArk → Open Management), and verify the exact versioned model IDs in `src/config/models.ts` against the console.

4. **Configure env** — copy `.env.example` to `.env.local` and fill in:
   - `ARK_API_KEY` (server only, never reaches the browser)
   - `DATABASE_URL` (server only — DO Managed Postgres connection string)
   - `DO_SPACES_REGION`, `DO_SPACES_BUCKET`, `DO_SPACES_KEY`, `DO_SPACES_SECRET` (server only)
   - `GEMINI_API_KEY` (server only) — one key serves both Nano Banana and Nano Banana Pro in the image-model picker. Without it both are still listed but fail at generate time.

5. **Run**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, type a prompt, get a saved image.

## Architecture

- **`src/config/models.ts`** — the model registry. Maps capability + tier → `{ provider, model }` with cost/duration/reference/audio metadata. BytePlus (Seedream/Seedance) only. No model IDs anywhere else in the app.
- **`src/lib/byteplus-server.ts`** — BytePlus ModelArk client (server-only).
- **`src/lib/prompt.ts`** — structured prompt builder (§5.3): subject · action · preset fragment · lighting · brand tokens · quality tokens, minus a negative prompt.
- **`src/app/api/generate/route.ts`** — server-side orchestrator: builds the prompt, resolves model, submits (retry primary once), captures the seed, copies the output into our DigitalOcean Space, and writes the full generation record.
- **`src/app/api/upscale/route.ts`** / **`src/app/api/background/remove/route.ts`** — Seedream image-to-image tools.
- **`src/app/api/generations/route.ts`** — gallery feed.
- **`src/lib/audio-extract.ts`** — pulls the audio out of a video in the
  browser and downsamples it to 16kHz mono, so a 500MB export becomes a few MB
  and fits OpenAI's 25MB per-request cap.
- **`src/lib/openai-whisper.ts`** — the `whisper-1` client, and the pairing of
  its flat word list back onto its segments.
- **`src/app/api/transcripts/*`** — the chunk endpoint, editing, exports and
  the AI layer.
- **`src/lib/subtitles.ts`** — SRT/VTT/text/Markdown/CSV rendering, including
  the cue-splitting and timing rules that make an SRT usable in an edit.
- **`db/schema.sql`** — `generations` table per §7 of the brief: endpoint, full payload, seed, cost, aspect, status, QC fields.

### Transcribe

Upload a video and get the voice-over back as timecoded text: word-level
timestamps, readable alongside the player, correctable in place, searchable
across every recording in the studio, and exportable as subtitles or a clean
script. On top of it: summary, chapters, the clips worth cutting, a Q&A that
answers with timecodes, and a one-click handoff into Storyboard.

**The engine is [openai/whisper](https://github.com/openai/whisper)**, via
OpenAI's hosted `whisper-1` — the only model they offer with word-level
timestamps, which is the point of the feature. $0.006 per minute of audio
($0.36/hr), billed to the second, nothing when idle.

**Turning it on** takes one variable: `OPENAI_API_KEY`, which the prompt
editor and the AI layer already use. Without it the tab loads and says
transcription is not configured.

**How a video gets under a 25MB API limit:** the browser decodes it, keeps the
audio, and downsamples to 16kHz mono — what Whisper listens to anyway — then
sends it in ten-minute chunks with their offsets. Only a few MB ever leaves the
machine, the upload is quick, and a two-hour recording is a handful of small
requests rather than one impossible one. ProRes and MKV cannot be decoded in a
browser; export MP4 or MP3 for those.

Chunks are posted from the browser, so **the tab stays open while a transcript
runs**. Each chunk is saved as it lands, so an interrupted run leaves a partial
transcript and Retry picks it up from the stored media.

`whisper-1` has no speaker diarization, so there are no speaker labels — for
voice-over there is one voice.

### Key guarantees

- `ARK_API_KEY` lives only in server env; the browser calls our API routes.
- Every generation stores provider + model + full payload + seed + cost → **Reproduce** re-runs with the same seed, **Vary** re-rolls it.
- Outputs are copied to our own storage; the provider CDN URL is kept only as fallback.
