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
- **`db/schema.sql`** — `generations` table per §7 of the brief: endpoint, full payload, seed, cost, aspect, status, QC fields.

### Key guarantees

- `ARK_API_KEY` lives only in server env; the browser calls our API routes.
- Every generation stores provider + model + full payload + seed + cost → **Reproduce** re-runs with the same seed, **Vary** re-rolls it.
- Outputs are copied to our own storage; the provider CDN URL is kept only as fallback.
