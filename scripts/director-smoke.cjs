/* eslint-disable @typescript-eslint/no-require-imports -- Opt-in CJS diagnostic loads its TypeScript modules after installing the loader. */
/* One real paid model request, then real video exports. Explicit opt-in only. */
const live = process.argv.includes("--live");
if (!live && !process.argv.includes("--render-only")) {
  console.error("Usage: node scripts/director-smoke.cjs --live|--render-only [--all-styles]. --live makes one paid model request; --render-only uses a labelled manual fixture. Outputs stay in a temporary directory.");
  process.exit(2);
}
require("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error: console.error });
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const ts = require("typescript");
require.extensions[".ts"] = function (module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  module._compile(output, filename);
};
const { createProject, patchProject } = require("../src/lib/director/store.ts");
const { planDirector } = require("../src/lib/director/planner.ts");
const { renderDirector } = require("../src/lib/director/render.ts");
(async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "athar-director-live-"));
  process.env.ATHAR_DIRECTOR_ROOT = path.join(dir, "projects");
  const owner = "local-smoke-test";
  let project = await createProject(owner, { title: "Astra production verification", kind: "motion", brief: "Create a designed 6-second YAZ Media motion typography piece, three scenes of 2 seconds each. Exact titles, in order: 'أثر يبقى', 'Made to matter', 'YAZ MEDIA'. Only title cards: there is no event footage, no audio, no product claim. Keep captions empty and voiceover empty. Use a restrained premium editorial treatment. Do not invent any source footage or claim this is recorded event coverage.", settings: { format: "9:16", duration: 6, language: "Arabic and English", locale: "UAE", style: "editorial", brandName: "YAZ MEDIA", accent: "#d4ed87" } });
  console.log(live ? "Requesting one real Director edit…" : "Rendering a manual verification fixture; no model request.");
  const plan = live ? await planDirector(project, "") : {
    model: "manual verification fixture", explanation: "Local render verification only. These exact scenes were written by the developer; no model request was made.",
    scenes: ["أثر يبقى", "Made to matter", "YAZ MEDIA"].map((title) => ({ id: require("node:crypto").randomUUID(), assetId: null, sourceIn: 0, duration: 2, title, caption: "", voiceover: "", note: "Manual verification fixture", transition: "fade", fit: "cover", locked: false, background: "#20262b" })),
  };
  console.log(JSON.stringify({ model: plan.model, scenes: plan.scenes.map((s) => ({ title: s.title, duration: s.duration, assetId: s.assetId })), explanation: plan.explanation }, null, 2));
  project = await patchProject(project.id, owner, { scenes: plan.scenes });
  const styles = process.argv.includes("--all-styles") ? ["editorial", "cinematic", "kinetic", "minimal"] : ["editorial"];
  const renders = [];
  for (const style of styles) {
    project.settings.style = style;
    const result = await renderDirector({ project, outputDir: path.join(dir, style), assetPath: async () => { throw new Error("This typography fixture uses no source assets"); }, onProgress: async (_progress, stage) => console.log(`${style}: ${stage}`) });
    renders.push({ style, file: result.filePath, thumbnail: result.thumbnailPath, width: result.width, height: result.height, duration: result.duration });
  }
  await fsp.writeFile(path.join(dir, "result.json"), JSON.stringify({ model: plan.model, scenes: plan.scenes, renders }, null, 2));
  console.log(JSON.stringify({ directory: dir, renders }, null, 2));
})().catch((error) => { console.error(error instanceof Error ? error.message.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]") : "Smoke test failed"); process.exitCode = 1; });
