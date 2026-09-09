import { postJson } from "@/lib/utils";
import type { GenerationJobRecord, GenerationRecord } from "@/lib/types";

/**
 * POST /api/generate for stills and wait for the pictures.
 *
 * Every still now comes back as a durable job (202) rather than an inline
 * render — the render itself outruns the gateway too often to hold the
 * connection open. This hides that: it queues, polls /api/jobs/[id] until
 * every job lands, and hands back the finished generation rows in order.
 * The studio keeps its own richer flow; Storyboards and Campaign use this.
 */

type GenerateResponse = {
  error?: string;
  generation?: GenerationRecord | null;
  generations?: GenerationRecord[];
  job?: GenerationJobRecord | null;
  jobs?: GenerationJobRecord[];
};

type JobPollResponse = {
  error?: string;
  job?: GenerationJobRecord;
  generation?: GenerationRecord | null;
};

const POLL_MS = 3000;
const DEADLINE_MS = 8 * 60 * 1000;

async function waitForJobs(
  jobs: GenerationJobRecord[]
): Promise<GenerationRecord[]> {
  const pending = new Set(jobs.map((j) => j.id));
  const results: GenerationRecord[] = [];
  const deadline = Date.now() + DEADLINE_MS;
  while (pending.size > 0) {
    if (Date.now() > deadline) {
      throw new Error(
        "The render is still working — check the Library in a minute"
      );
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
    for (const id of [...pending]) {
      let json: JobPollResponse;
      try {
        const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
        json = (await res.json()) as JobPollResponse;
        if (!res.ok || !json.job) continue;
      } catch {
        continue; // transient network blip — poll again
      }
      if (json.job.status === "completed") {
        if (json.generation) results.push(json.generation);
        pending.delete(id);
      } else if (
        json.job.status === "failed" ||
        json.job.status === "cancelled"
      ) {
        pending.delete(id);
        throw new Error(json.job.error ?? "Image render failed");
      }
    }
  }
  return results;
}

export async function generateStills(
  body: Record<string, unknown>
): Promise<GenerationRecord[]> {
  const { res, json } = await postJson<GenerateResponse>("/api/generate", body);
  if (!res.ok) throw new Error(json.error ?? "Generation failed");

  const jobs = json.jobs?.length ? json.jobs : json.job ? [json.job] : [];
  if (jobs.length > 0) return waitForJobs(jobs);

  // An older server answering inline still works.
  if (json.generations?.length) return json.generations;
  return json.generation ? [json.generation] : [];
}
