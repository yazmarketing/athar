import "server-only";
import { db } from "@/lib/db";
import { uploadPublicObject } from "@/lib/storage";
import type { GenerationRecord } from "@/lib/types";
import { ensureBrowserMp4 } from "@/lib/video-compat";

/** One library row by id, or null if it is gone. */
export async function getGeneration(
  id: string
): Promise<GenerationRecord | null> {
  const { rows } = await db().query(
    `select * from generations where id = $1 and deleted_at is null`,
    [id]
  );
  return (rows[0] as GenerationRecord) ?? null;
}

/**
 * Copy a provider CDN output into DigitalOcean Spaces. Falls back to the
 * provider URL when the copy fails (provider URLs are temporary).
 */
export async function persistOutputToSpaces(
  url: string,
  kind: "image" | "video",
  mode: string,
  seed: number | null
): Promise<string> {
  try {
    const res = await fetch(url);
    let blob = await res.arrayBuffer();
    const contentType =
      kind === "video"
        ? "video/mp4"
        : (res.headers.get("content-type") ?? "image/png");
    if (kind === "video") {
      // Seedance sometimes hands back HEVC. Chrome then plays time/audio
      // with a black picture. Re-wrap as H.264 at the same size when needed.
      blob = await ensureBrowserMp4(blob);
    }
    const ext =
      kind === "video"
        ? "mp4"
        : contentType.includes("webp")
          ? "webp"
          : contentType.includes("jpeg")
            ? "jpg"
            : "png";
    const path = `${mode}/${Date.now()}-${seed ?? "v"}.${ext}`;
    return await uploadPublicObject(path, blob, contentType);
  } catch {
    return url;
  }
}

/**
 * Older databases restrict `generations.mode` to the original four values.
 * Relax the check to include tool modes ('upscale', 'edit') and video
 * edit/extend ('v2v'). Idempotent.
 */
export async function ensureGenerationModes() {
  await db().query(`
    do $$
    begin
      alter table public.generations
        drop constraint if exists generations_mode_check;
      alter table public.generations
        add constraint generations_mode_check
        check (mode in ('t2i', 'i2v', 't2v', 'v2v', 'lipsync', 'upscale', 'edit'));
    exception
      when others then null;
    end $$
  `);
}

let favoriteColumnReady: Promise<void> | null = null;

/** Add `is_favorite` once per process — never on the gallery GET hot path. */
export function ensureFavoriteColumn() {
  if (!favoriteColumnReady) {
    favoriteColumnReady = db()
      .query(
        `alter table public.generations
         add column if not exists is_favorite boolean not null default false`
      )
      .then(() => undefined)
      .catch((err) => {
        favoriteColumnReady = null;
        throw err;
      });
  }
  return favoriteColumnReady;
}

export type InsertGenerationInput = {
  mode: string;
  tier: string;
  modelEndpoint: string;
  inputPayload: Record<string, unknown>;
  finalPrompt: string;
  negativePrompt: string;
  seed: number | null;
  referenceUrls: string[];
  outputUrl: string;
  providerUrl: string | null;
  requestId: string | null;
  cost: number;
  aspect: string;
  durationS: number | null;
  userId: string | null;
  projectId: string | null;
  brandKitId: string | null;
  /** Measured provider round-trip in ms, for "took Ns" in the detail panel. */
  renderMs?: number | null;
};

/** Insert a completed `generations` row and return it. */
export async function insertGeneration(
  input: InsertGenerationInput
): Promise<GenerationRecord> {
  const { rows } = await db().query(
    `insert into generations
       (mode, tier, model_endpoint, input_payload, final_prompt,
        negative_prompt, seed, reference_urls, status, output_url,
        fal_url, request_id, cost, aspect, duration_s, client_ready,
        user_id, project_id, brand_kit_id, render_ms, completed_at)
     values
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, now())
     returning *`,
    [
      input.mode,
      input.tier,
      input.modelEndpoint,
      JSON.stringify(input.inputPayload),
      input.finalPrompt,
      input.negativePrompt,
      input.seed,
      input.referenceUrls,
      "ready",
      input.outputUrl,
      input.providerUrl,
      input.requestId,
      input.cost,
      input.aspect,
      input.durationS,
      false,
      input.userId,
      input.projectId,
      input.brandKitId,
      input.renderMs ?? null,
    ]
  );
  return rows[0] as GenerationRecord;
}
