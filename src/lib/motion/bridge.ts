import "server-only";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { userRoot } from "./store";
const marker = '"__ATHAR_WORKSPACE_ROOT__"';
export function compileBridge(template: string, root: string) {
  if (!path.isAbsolute(root) || root.includes("\0")) throw new Error("Invalid bridge workspace");
  if (template.split(marker).length !== 2) throw new Error("Invalid bridge template: expected one workspace marker");
  // A callback preserves literal $&, $` and $' in local filesystem paths.
  const compiled = template.replace(marker, () => JSON.stringify(root).replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029"));
  if (compiled.includes(marker)) throw new Error("Bridge setup could not be completed");
  return compiled;
}
export async function prepareBridge(user: string) {
  const root = userRoot(user); await mkdir(root,{recursive:true});
  const template = await readFile(path.join(process.cwd(),"scripts/motion/bridge-runtime.jsx.txt"),"utf8");
  const script = compileBridge(template,root);
  const file = path.join(root,"Athar-After-Effects.jsx");
  const tmp = `${file}.${randomUUID()}.tmp`; await writeFile(tmp,script,{mode:0o600}); await rename(tmp,file);
  const pointer = path.join(process.cwd(),".athar/motion/last-bridge.txt");
  const pointerTmp = `${pointer}.${randomUUID()}.tmp`; await writeFile(pointerTmp,file,{mode:0o600}); await rename(pointerTmp,pointer);
  return { script, file };
}
