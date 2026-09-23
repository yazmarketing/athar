import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
vi.mock("@/lib/motion/media",()=>({assetImage:vi.fn(async()=>"data:image/png;base64,output"),sourceReferenceImage:vi.fn(async()=>"data:image/jpeg;base64,original")}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/motion/response", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/motion/response")>(), motionResponse: vi.fn(), motionResponseText: (r: { text: string }) => r.text }));
import { motionResponse } from "@/lib/motion/response";
import { advanceDesign } from "@/lib/motion/designer";
import { createProject, getProject, saveProject, userRoot, projectRoot } from "@/lib/motion/store";
import type { MotionProject, MotionScene } from "@/lib/motion/schema";
const request = vi.mocked(motionResponse);
let user: string;
let now: number;
const settings = { width: 1920, height: 1080, duration: 3, fps: 30 };
const scene: MotionScene = { ...settings, name: "Revised", background: "#222222", summary: "Revised timing", changes: [], layers: [] };
async function pending() {
  const p = await createProject(user, "Original", "create");
  p.scene = { ...scene, name: "Original" }; p.movie = "runs/previous/output.mp4";
  p.status = "designing";
  p.designJob = { id: randomUUID(), instruction: "Use the uploaded logo", settings, fonts: [], startedAt: now, nextCheckAt: 0 };
  await saveProject(user, p); return p;
}
function response(status: string, extra = {}) { return { id: "resp_one", status, ...extra } as Awaited<ReturnType<typeof motionResponse>>; }
beforeEach(() => { user = `motion-design-test-${randomUUID()}`; now = Date.now(); vi.spyOn(Date, "now").mockImplementation(() => now); request.mockReset(); });
afterEach(async () => { vi.restoreAllMocks(); await rm(userRoot(user), { recursive: true, force: true }); });
describe("durable motion revisions", () => {
  it("does not spend a generation on metadata-only composition matching",async()=>{
    const p=await pending();p.mode="edit";p.baseComp={...settings,id:54,name:"Original",layers:[]};await saveProject(user,p);
    await advanceDesign(user,p.id);expect(request).not.toHaveBeenCalled();expect(await getProject(user,p.id)).toMatchObject({status:"failed",movie:p.movie,error:expect.stringContaining("Study the source style")});
  });
  it("sends pinned original frames and property evidence separately from the prior output and requires an explained match",async()=>{
    const p=await pending();p.mode="edit";p.baseComp={...settings,id:54,name:"Original",layers:[]};p.frames=["runs/previous/frame-0.png"];
    p.sourceStudy={compId:54,capturedAt:new Date().toISOString(),report:"runs/study/study.json",frames:[{file:"runs/study/source-0.png",time:0.25}],compositionCount:1,truncated:false};
    const out=path.join(projectRoot(user,p.id),"runs/study");await mkdir(out,{recursive:true});await writeFile(path.join(out,"study.json"),JSON.stringify({nativeFill:[1,0.25,0],font:"BrandFont",keys:[{time:0.3,influence:80}]}));await saveProject(user,p);
    const styleMatch={palette:"Source orange",typography:"BrandFont from source",motion:"Source keyframe ease",layout:"Original framing",limitations:["Sampled stills only"]};
    request.mockResolvedValue(response("completed",{text:JSON.stringify({...scene,styleMatch})}));await advanceDesign(user,p.id);
    const sent=JSON.stringify(request.mock.calls[0][0]);expect(sent).toContain("ORIGINAL SOURCE Original, 0.250s");expect(sent).toContain("data:image/jpeg;base64,original");expect(sent).toContain("data:image/png;base64,output");expect(sent).toContain("nativeFill");expect(sent).toContain("BrandFont");expect(sent).toContain("styleMatch");
    const result=await getProject(user,p.id);expect(result.scene?.styleMatch).toEqual(styleMatch);expect(result.sourceStudy).toEqual(p.sourceStudy);
  });
  it("keeps the saved direction and old output through a revision taking longer than four minutes", async () => {
    const p = await pending(); request.mockResolvedValue(response("in_progress"));
    await advanceDesign(user, p.id);
    now += 6 * 60000;
    expect(await getProject(user, p.id)).toMatchObject({ status: "designing", movie: p.movie, designJob: { instruction: "Use the uploaded logo", responseId: "resp_one" } });
    request.mockResolvedValue(response("completed", { text: JSON.stringify(scene) }));
    await advanceDesign(user, p.id);
    const result = await getProject(user, p.id);
    expect(request.mock.calls[1][0]).toBe("resp_one");
    expect(result).toMatchObject({ status: "ready", name: "Revised", brief: "Use the uploaded logo" });
    expect(result.movie).toBeUndefined(); expect(result.revisions).toHaveLength(1);
  });
  it("retries a timed-out status check without submitting a second generation", async () => {
    const p = await pending(); request.mockResolvedValueOnce(response("queued")); await advanceDesign(user, p.id);
    now += 4000; request.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError")); await advanceDesign(user, p.id);
    expect(await getProject(user, p.id)).toMatchObject({ status: "designing", movie: p.movie, designJob: { notice: expect.stringContaining("Reconnecting") } });
    now += 16000; request.mockResolvedValueOnce(response("in_progress")); await advanceDesign(user, p.id);
    expect(request.mock.calls.slice(1).map(c => c[0])).toEqual(["resp_one", "resp_one"]);
  });
  it("does not automatically repeat an ambiguous initial submission", async () => {
    const p = await pending(); request.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    await advanceDesign(user, p.id); await advanceDesign(user, p.id);
    expect(request).toHaveBeenCalledTimes(1);
    expect(await getProject(user, p.id)).toMatchObject({ status: "failed", movie: p.movie, designJob: { instruction: "Use the uploaded logo" }, error: expect.stringContaining("direction is saved") });
  });
  it("recovers a known response after an interrupted worker lease", async () => {
    const p = await pending(); Object.assign(p.designJob!, { responseId: "resp_one", lease: "old", leaseUntil: now - 1 }); await saveProject(user, p);
    request.mockResolvedValue(response("completed", { text: JSON.stringify(scene) })); await advanceDesign(user, p.id);
    expect(request).toHaveBeenCalledWith("resp_one"); expect((await getProject(user, p.id)).status).toBe("ready");
  });
  it("does not resubmit when a server restarted before saving the submission response", async () => {
    const p = await pending(); Object.assign(p.designJob!, { submittedAt: now - 100000, leaseUntil: now - 1 }); await saveProject(user, p);
    await advanceDesign(user, p.id); expect(request).not.toHaveBeenCalled(); expect((await getProject(user, p.id)).status).toBe("failed");
  });
  it("serializes concurrent checks and ignores a late result for an old job", async () => {
    const p = await pending(); let finish!: (r: Awaited<ReturnType<typeof motionResponse>>) => void;
    request.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const running = advanceDesign(user, p.id);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await advanceDesign(user, p.id); expect(request).toHaveBeenCalledTimes(1);
    const latest = await getProject(user, p.id); latest.designJob!.id = randomUUID(); latest.name = "New job"; await saveProject(user, latest);
    finish(response("completed", { text: JSON.stringify(scene) })); await running;
    expect((await getProject(user, p.id)).name).toBe("New job");
  });
  it("recovers a confirmed output limit once with more space and the entire original brief", async () => {
    const p = await pending(); request.mockResolvedValueOnce(response("incomplete", { incomplete_details: { reason: "max_output_tokens" } }));
    await advanceDesign(user, p.id);
    const recovery = await getProject(user, p.id);
    expect(recovery).toMatchObject({ status: "designing", movie: p.movie, designJob: { maxOutputTokens: 128000, recoveryAttempt: 1, instruction: "Use the uploaded logo", previousResponseIds: ["resp_one"] } });
    expect(recovery.designJob?.responseId).toBeUndefined();
    request.mockResolvedValueOnce(response("completed", { text: JSON.stringify(scene) }));
    await advanceDesign(user, p.id);
    expect(request.mock.calls[1][1]).toBe(128000);
    expect(JSON.stringify(request.mock.calls[1][0])).toContain("Use the uploaded logo");
    expect((await getProject(user, p.id)).status).toBe("ready");
  });
  it("never loops automatically after the expanded attempt also reaches its limit", async () => {
    const p = await pending(); request.mockResolvedValue(response("incomplete", { incomplete_details: { reason: "max_output_tokens" } }));
    await advanceDesign(user, p.id); await advanceDesign(user, p.id); await advanceDesign(user, p.id);
    expect(request).toHaveBeenCalledTimes(2);
    expect(await getProject(user, p.id)).toMatchObject({ status: "failed", movie: p.movie, designJob: { failureCode: "output_limit", recoveryAttempt: 1 } });
  });
  it("reviews native frames without replacing or clearing the original animation", async () => {
    const p=await pending(); p.designJob!.purpose="review";p.nativeCompId=22; await saveProject(user,p);
    request.mockResolvedValue(response("completed",{text:JSON.stringify({summary:"Based on sampled stills only",strengths:["Legible lockup"],fixes:["Hold the final frame longer"]})}));
    await advanceDesign(user,p.id);const reviewed=await getProject(user,p.id);
    expect(reviewed).toMatchObject({status:"complete",scene:p.scene,movie:p.movie,review:{fixes:["Hold the final frame longer"]}});
    expect(reviewed.revisions).toHaveLength(0);expect(reviewed.designJob).toBeUndefined();
    expect(JSON.stringify(request.mock.calls[0][0])).toContain("NOT the complete moving film");
  });
  it("preserves the existing animation and direction if Astra returns an invalid scene", async () => {
    const p: MotionProject = await pending(); request.mockResolvedValue(response("completed", { text: "{}" })); await advanceDesign(user, p.id);
    expect(await getProject(user, p.id)).toMatchObject({ status: "failed", scene: p.scene, movie: p.movie, designJob: { instruction: "Use the uploaded logo" } });
  });
});

it("persists a reference treatment before submitting the construction stage",async()=>{
 const p=await pending();p.designJob!.phase="study";p.referenceComp={...settings,id:54,name:"Reference",layers:[]};
 p.sourceStudy={compId:54,capturedAt:new Date().toISOString(),report:"runs/study/study.json",frames:[],compositionCount:1,truncated:false};
 const out=path.join(projectRoot(user,p.id),"runs/study");await mkdir(out,{recursive:true});await writeFile(path.join(out,"study.json"),JSON.stringify({compositions:[p.referenceComp]}));await saveProject(user,p);
 const treatment={visualLanguage:"Purple dimensional ribbons",animationLanguage:"Flowing reveal, settled hold",adaptationPlan:"Use NAME and TITLE at social-safe scale",nativeReuse:"Preserve original native effect stack",limitations:["Inspect expression dependencies"]};
 request.mockResolvedValueOnce(response("completed",{text:JSON.stringify(treatment)}));await advanceDesign(user,p.id);
 const studied=await getProject(user,p.id);expect(studied).toMatchObject({status:"designing",movie:p.movie,referenceTreatment:treatment,designJob:{phase:"design",treatment}});expect(studied.designJob?.responseId).toBeUndefined();
 const styleMatch={palette:"Native purple",typography:"Source type",motion:"Retained keyframes",layout:"Adapted to output",limitations:[]};
 request.mockResolvedValueOnce(response("completed",{text:JSON.stringify({...scene,styleMatch})}));await advanceDesign(user,p.id);
 expect(JSON.stringify(request.mock.calls[1][0])).toContain("Purple dimensional ribbons");expect((await getProject(user,p.id)).status).toBe("ready");
});
