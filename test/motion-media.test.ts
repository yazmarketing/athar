import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { inspectAsset, encodePreview, sampleRenderedFrames } from "../src/lib/motion/media";
import { runFfmpeg } from "../src/lib/director/media";
it("decodes actual footage, extracts visual context and exports playable H.264", async()=>{
 const dir=await mkdtemp(join(tmpdir(),"athar-motion-media-"));
 try { const source=join(dir,"source.mov"),target=join(dir,"preview.mp4");
 await runFfmpeg(["-y","-f","lavfi","-i","testsrc2=size=320x180:rate=24","-t","1","-c:v","libx264","-threads","2",source]);
 expect(await inspectAsset(source,"video/quicktime")).toMatchObject({duration:1,width:320,height:180,preview:"source.mov.jpg"});
 expect((await readFile(source+".jpg")).length).toBeGreaterThan(100);
 await encodePreview(source,target);expect(await inspectAsset(target,"video/mp4")).toMatchObject({duration:1,width:320,height:180});
 await sampleRenderedFrames(target,dir,1);
 for(let i=0;i<5;i++)expect((await readFile(join(dir,`frame-${i}.png`))).length).toBeGreaterThan(100);
 await writeFile(join(dir,"bad.mp4"),"not a movie");await expect(inspectAsset(join(dir,"bad.mp4"),"video/mp4")).rejects.toThrow("could not be decoded");
 } finally {await rm(dir,{recursive:true,force:true});}
},30000);
