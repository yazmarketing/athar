import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile, statfs } from "node:fs/promises";
import path from "node:path";
vi.mock("next/server",()=>({ after:vi.fn() }));
vi.mock("node:fs/promises",async original=>({...await original<typeof import("node:fs/promises")>(),statfs:vi.fn(async()=>({type:0,bsize:4096,blocks:1e9,bfree:1e9,bavail:1e9,files:1e9,ffree:1e9}))}));
import { atharIdent } from "../src/lib/motion/ident";
import { createProject, getProject, locked, projectRoot, queueNative, queueSourceStudy, saveProject, userRoot } from "../src/lib/motion/store";
const users:string[]=[];
function user(){const id=`motion-test-${randomUUID()}`;users.push(id);return id;}
afterEach(async()=>{for(const u of users.splice(0))await rm(userRoot(u),{recursive:true,force:true});});
describe("native project persistence",()=>{
 it("isolates projects by signed-in user and rejects traversal",async()=>{const a=user(),b=user();const p=await createProject(a,"Example","create");expect((await getProject(a,p.id)).name).toBe("Example");await expect(getProject(b,p.id)).rejects.toThrow("not found");expect(()=>projectRoot(a,"../../outside")).toThrow("Invalid");});
 it("serializes updates without rejecting polling requests",async()=>{const u=user(),p=await createProject(u,"Start","create");await Promise.all([locked(u,p.id,async()=>{const a=await getProject(u,p.id);a.name+=" first";await saveProject(u,a);}),locked(u,p.id,async()=>{const a=await getProject(u,p.id);a.name+=" second";await saveProject(u,a);})]);expect((await getProject(u,p.id)).name).toBe("Start first second");});
 it("requires a live bridge before a native command can be sent",async()=>{const u=user(),p=await createProject(u,"Example","create");await expect(queueNative(u,p,"build")).rejects.toThrow("Connect");});
 it("ends unclaimed operations with an actionable failure",async()=>{const u=user(),p=await createProject(u,"Example","create");p.status="queued";p.commandId=randomUUID();p.commandAt=Date.now()-130000;await saveProject(u,p);expect(await getProject(u,p.id)).toMatchObject({status:"failed",error:expect.stringContaining("did not pick up")});});
 it("recovers preview frames written after native completion",async()=>{const u=user(),p=await createProject(u,"Late frames","create");p.status="complete";p.commandKind="build";p.commandId=randomUUID();p.nativeCompId=7;await saveProject(u,p);expect((await getProject(u,p.id)).frames).toBeUndefined();const out=path.join(projectRoot(u,p.id),"runs",p.commandId);await mkdir(out,{recursive:true});await writeFile(path.join(out,"poster.png"),"png");for(let i=0;i<5;i++)await writeFile(path.join(out,`frame-${i}.png`),"png");const ready=await getProject(u,p.id);expect(ready.frames).toHaveLength(5);expect(ready.preview).toContain("poster.png");});
 it("rejects advanced controls on an outdated connected bridge",async()=>{const u=user(),p=await createProject(u,"Advanced","create");p.scene=atharIdent("mark","wordmark");p.assets=["mark","wordmark"].map(id=>({id,name:id,filename:id+".png",bytes:1,type:"image/png"}));await writeFile(path.join(userRoot(u),"heartbeat.json"),JSON.stringify({updatedAt:Date.now(),version:"26",activeComp:null,fonts:[]}));await expect(queueNative(u,p,"build")).rejects.toThrow("updated bridge");});
 it("propagates native failures without inventing video output",async()=>{const u=user(),p=await createProject(u,"Example","create");p.status="queued";p.commandId=randomUUID();p.commandAt=Date.now();await saveProject(u,p);const out=path.join(projectRoot(u,p.id),"runs",p.commandId);await mkdir(out,{recursive:true});await writeFile(path.join(out,"result.json"),JSON.stringify({ok:false,error:"Source footage is too short"}));expect(await getProject(u,p.id)).toMatchObject({status:"failed",error:"Source footage is too short"});expect(JSON.parse(await readFile(path.join(projectRoot(u,p.id),"project.json"),"utf8")).movie).toBeUndefined();});
 it("studies the pinned original rather than the currently active generated output, and waits for all reference frames",async()=>{
  const u=user(),p=await createProject(u,"Lower third","edit");
  const original={id:54,name:"Original",width:1920,height:1080,duration:30,fps:30,layers:[]};p.baseComp=original;p.nativeCompId=314;p.movie="runs/old/output.mp4";
  await writeFile(path.join(userRoot(u),"heartbeat.json"),JSON.stringify({updatedAt:Date.now(),version:"26",capabilities:6,activeComp:{...original,id:314,name:"Generic revision"},fonts:[]}));
  await queueSourceStudy(u,p,false);
  const command=JSON.parse(await readFile(path.join(userRoot(u),"inbox",`${p.commandId}.json`),"utf8"));expect(command).toMatchObject({kind:"inspect",compId:54});expect(command.scene).toBeUndefined();
  const out=path.join(projectRoot(u,p.id),"runs",p.commandId!);
  await writeFile(path.join(out,"study.json"),JSON.stringify({version:1,comp:original,compositions:[original],frames:Array.from({length:12},(_,i)=>({time:i})),truncated:false}));
  await writeFile(path.join(out,"result.json"),JSON.stringify({ok:true,compId:54}));
  expect(await getProject(u,p.id)).toMatchObject({status:"working",movie:p.movie,nativeCompId:314});
  for(let i=0;i<12;i++)await writeFile(path.join(out,`source-${i}.png`),"png");
  const ready=await getProject(u,p.id);expect(ready).toMatchObject({status:"complete",movie:p.movie,nativeCompId:314,sourceStudy:{compId:54,compositionCount:1}});expect(ready.sourceStudy?.frames).toHaveLength(12);expect(ready.frames).toBeUndefined();
 });
 it("rejects metadata-only bridges for source matching",async()=>{const u=user(),p=await createProject(u,"Edit","edit");await writeFile(path.join(userRoot(u),"heartbeat.json"),JSON.stringify({updatedAt:Date.now(),capabilities:3}));await expect(queueSourceStudy(u,p,true)).rejects.toThrow("updated bridge");});
 it("rejects a low-disk capture before queueing or changing the saved design",async()=>{
  const u=user(),p=await createProject(u,"Saved","edit");p.baseComp={id:1,name:"Original",width:1920,height:1080,duration:6,fps:30,layers:[]};await saveProject(u,p);
  await writeFile(path.join(userRoot(u),"heartbeat.json"),JSON.stringify({updatedAt:Date.now(),capabilities:6,activeComp:p.baseComp}));
  vi.mocked(statfs).mockResolvedValueOnce({type:0,bsize:4096,blocks:1,bfree:1,bavail:1,files:1,ffree:1});
  await expect(queueSourceStudy(u,p,false)).rejects.toThrow("Free at least");expect((await getProject(u,p.id)).status).toBe("idle");
 });
 it("preserves the existing workspace when a different active source is selected",async()=>{
  const u=user(),p=await createProject(u,"Original workspace","edit");p.baseComp={id:1,name:"First",width:1920,height:1080,duration:6,fps:30,layers:[]};p.movie="runs/old/output.mp4";await saveProject(u,p);
  await writeFile(path.join(userRoot(u),"heartbeat.json"),JSON.stringify({updatedAt:Date.now(),capabilities:6,activeComp:{...p.baseComp,id:2,name:"Second"}}));
  const next=await queueSourceStudy(u,p,true);expect(next.id).not.toBe(p.id);expect(await getProject(u,p.id)).toMatchObject({name:"Original workspace",baseComp:{id:1},movie:p.movie});
 });
 it("finishes malformed source captures with an actionable error and preserves output",async()=>{
  const u=user(),p=await createProject(u,"Original","edit");p.status="working";p.commandKind="inspect";p.commandId=randomUUID();p.movie="old.mp4";await saveProject(u,p);
  const out=path.join(projectRoot(u,p.id),"runs",p.commandId);await mkdir(out,{recursive:true});await writeFile(path.join(out,"result.json"),JSON.stringify({ok:true,compId:54}));
  expect(await getProject(u,p.id)).toMatchObject({status:"failed",movie:"old.mp4",error:expect.stringContaining("incomplete source study")});
 });
 it("keeps a successfully built native composition when only preview rendering fails",async()=>{
  const u=user(),p=await createProject(u,"Built","create");p.status="working";p.commandKind="build";p.commandId=randomUUID();await saveProject(u,p);
  const out=path.join(projectRoot(u,p.id),"runs",p.commandId);await mkdir(out,{recursive:true});await writeFile(path.join(out,"project.aep"),"native project");await writeFile(path.join(out,"result.json"),JSON.stringify({ok:true,compId:42,previewError:"Render failed"}));
  expect(await getProject(u,p.id)).toMatchObject({status:"complete",nativeCompId:42,nativeProject:expect.stringContaining("project.aep"),error:expect.stringContaining("preview render failed")});
 });
});

it("keeps a reference separate from the deliverable settings",async()=>{
 const u=user(),p=await createProject(u,"New social film","create");
 const source={id:54,name:"Reference",width:1152,height:2688,duration:30,fps:30,layers:[]};
 await writeFile(path.join(userRoot(u),"heartbeat.json"),JSON.stringify({updatedAt:Date.now(),capabilities:6,activeComp:source}));
 const pending=await queueSourceStudy(u,p,true,"reference"),out=path.join(projectRoot(u,p.id),"runs",pending.commandId!);
 await writeFile(path.join(out,"study.json"),JSON.stringify({version:2,comp:source,compositions:[source],frames:Array.from({length:12},(_,i)=>({time:i})),truncated:false}));
 for(let i=0;i<12;i++)await writeFile(path.join(out,`source-${i}.png`),"png");
 await writeFile(path.join(out,"result.json"),JSON.stringify({ok:true,compId:54}));
 expect(await getProject(u,p.id)).toMatchObject({mode:"create",baseComp:null,referenceComp:{id:54},sourceStudy:{compId:54}});
});
