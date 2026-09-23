/* eslint-disable @typescript-eslint/no-require-imports -- CJS bootstrap must register the TypeScript loader before loading worker code. */
/* Detached self-hosted Director worker. Uses the installed TypeScript compiler;
   this does not require a runtime transpiler dependency or an open browser. */
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  module._compile(output, filename);
};
const [projectId, runId] = process.argv.slice(2);
const valid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
if (!valid.test(projectId || "") || !valid.test(runId || "")) process.exit(2);
require("../src/lib/director/worker.ts").runDirectorWorker(projectId, runId).catch(() => { process.exitCode = 1; });
