import "server-only";
import path from "node:path";
import { mkdir, copyFile, stat } from "node:fs/promises";
import { createProject, projectRoot, saveProject } from "./store";
import { atharIdent } from "./ident";
import { validateScene } from "./schema";
import { inspectAsset } from "./media";
export async function createIdentStudy(user: string) {
  const p=await createProject(user,"ATHAR — Enter the Trace · Studio study","create");
  const dir=path.join(projectRoot(user,p.id),"assets");await mkdir(dir,{recursive:true});
  for(const [id,filename] of [["athar-mark","athar-arabic-mark-white.png"],["athar-wordmark","athar-wordmark-en-white.png"]]) {
    const file=path.join(dir,filename);await copyFile(path.join(process.cwd(),"public/logos",filename),file);
    p.assets.push({id,name:filename,filename,type:"image/png",bytes:(await stat(file)).size,...await inspectAsset(file,"image/png")});
  }
  p.scene=validateScene(atharIdent("athar-mark","athar-wordmark"),p.assets);p.status="ready";
  p.brief="Seven-second Athar ident. Enter through a macro view of the approved mark, separate into real spatial traces, accelerate through a luminous corridor, resolve to the exact mark and wordmark with a subtle imprint wave and a confident final hold. Preserve the approved assets. Restrained cream, sage and charcoal. Timed tonal sound design. Refine this authored studio study against the rendered frames.";
  p.revisions=[{scene:p.scene,brief:p.brief,at:new Date().toISOString()}];return saveProject(user,p);
}
