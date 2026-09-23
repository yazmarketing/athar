import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createProject, getProject, patchProject } from "../src/lib/director/store";
import { planDirector } from "../src/lib/director/planner";
import type { DirectorScene } from "../src/lib/director-types";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "athar-planner-")); vi.stubEnv("ATHAR_DIRECTOR_ROOT", root); vi.stubEnv("OPENAI_API_KEY", "test-placeholder"); });
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(root, { recursive: true, force: true }); });
const scene = (): DirectorScene => ({ id: randomUUID(), assetId: null, duration: 2, sourceIn: 0, title: "A clear story", caption: "", voiceover: "", note: "", transition: "cut", fit: "cover", locked: false, background: "#222222" });

it("rejects a stale save without overwriting the current production", async () => {
  const project = await createProject("owner", { title: "Original" });
  await patchProject(project.id, "owner", { title: "Approved", version: 0 });
  await expect(patchProject(project.id, "owner", { title: "Stale edit", version: 0 })).rejects.toMatchObject({ status: 409 });
  expect((await getProject(project.id, "owner")).title).toBe("Approved");
});

it("offers bounded public research and includes selected audio and real source citations", async () => {
  const project = await createProject("owner", { brief: "A factual film about the local museum", settings: { soundtrackLoop: false } });
  project.audioAssetId = randomUUID();
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "completed", model: "gpt-6-astra", output: [
    { type: "web_search_call", action: { sources: [{ title: "Museum", url: "https://museum.example/about" }, { title: "Invalid", url: "javascript:alert(1)" }] } },
    { type: "message", content: [{ type: "output_text", text: JSON.stringify({ scenes: [scene()], explanation: "Review the museum facts." }) }] },
  ] })));
  vi.stubGlobal("fetch", fetchMock);
  const result = await planDirector(project, "");
  const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(payload.tools).toEqual([{ type: "web_search" }]); expect(payload.store).toBe(false);
  expect(payload.instructions).toContain("Never search for private client details");
  expect(JSON.parse(payload.input[0].content[0].text).selectedAudioAssetId).toBe(project.audioAssetId);
  expect(result.explanation).toContain("https://museum.example/about"); expect(result.explanation).not.toContain("javascript:");
});

it("does not accept a partially completed provider response as a finished plan", async () => {
  const project = await createProject("owner", { brief: "A title sequence" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "incomplete", output_text: JSON.stringify({ scenes: [scene()], explanation: "Partial" }) }))));
  await expect(planDirector(project, "")).rejects.toThrow("incomplete edit");
  expect((await getProject(project.id, "owner")).scenes).toHaveLength(0);
});
