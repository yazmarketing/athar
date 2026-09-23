import type { Keyframe } from "./schema";
export type Vector3 = [number, number, number];
export type MotionPath = { vertices: [number, number][]; inTangents?: [number, number][]; outTangents?: [number, number][]; closed: boolean };
export type LayerCraft = {
  parentId?: string;
  threeD?: { z: number; rotationX: number; rotationY: number; animation: Partial<Record<"z" | "rotationX" | "rotationY", Keyframe[]>> };
  stroke?: { color: string; width: number; fill: boolean };
  vector?: MotionPath;
  trim?: { start: number; end: number; offset: number; animation: Partial<Record<"start" | "end" | "offset", Keyframe[]>> };
  masks?: { space?: "source" | "text-box" | "layer-box"; path: MotionPath; mode: "add" | "subtract"; feather: number; expansion: number; opacity: number; animation: Partial<Record<"expansion" | "opacity", Keyframe[]>> }[];
  repeat?: { count: number; position: Vector3; rotation: number; scale: number; delay: number };
};
export type MotionCamera = { position: Vector3; target: Vector3; zoom: number; depthOfField: boolean; focusDistance: number; aperture: number; animation: Partial<Record<"position" | "target" | "zoom" | "focusDistance" | "aperture", Keyframe[]>> };
export type SoundCue = { time: number; duration: number; type: "rise" | "impact" | "tone" | "air"; frequency: number; gain: number; pan: number };
export type SceneCraft = { precompositions?: { name:string; layerIds:string[]; collapse:boolean }[]; camera?: MotionCamera; motionBlur?: { shutterAngle: number; samples: number }; beats?: { time: number; label: string; direction: string }[]; soundtrack?: { gain: number; cues: SoundCue[] } };
const o = (v: unknown): Record<string,unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("Invalid motion controls"); return v as Record<string,unknown>; };
const n = (v: unknown,min:number,max:number,label:string) => { if(typeof v!=="number"||!Number.isFinite(v)||v<min||v>max)throw Error(`Invalid ${label} (${min}–${max})`); return v; };
const text = (v:unknown,max:number) => { if(typeof v!=="string"||v.length>max)throw Error("Invalid motion description"); return v; };
const flag = (v:unknown) => {if(typeof v!=="boolean")throw Error("Invalid motion switch");return v;};
const hex = (v:unknown) => {if(typeof v!=="string"||!/^#[a-f\d]{6}$/i.test(v))throw Error("Invalid stroke color");return v;};
const vec = (v:unknown,length:number) => {if(!Array.isArray(v)||v.length!==length)throw Error("Invalid motion vector");return v.map(x=>n(x,-100000,100000,"coordinate"));};
export function easing(k: Record<string,unknown>) {
  return { ...(k.influenceIn !== undefined ? { influenceIn:n(k.influenceIn,0.1,100,"incoming influence") } : {}), ...(k.influenceOut !== undefined ? { influenceOut:n(k.influenceOut,0.1,100,"outgoing influence") } : {}) };
}
function keys(raw:unknown,duration:number,ranges:Record<string,[number,number]|"vector3">) {
  const result:Record<string,Keyframe[]>={};
  for(const [channel,value] of Object.entries(o(raw??{}))){const range=ranges[channel];if(!range||!Array.isArray(value)||value.length>100)throw Error("Unsupported advanced animation channel");let previous=-1;
    result[channel]=value.map(raw=>{const k=o(raw),time=n(k.time,0,duration,"key time");if(time<=previous)throw Error("Keyframes must have ascending times");previous=time;if(!["linear","smooth","hold"].includes(String(k.ease)))throw Error("Invalid easing");return {time,ease:k.ease as Keyframe["ease"],value:range==="vector3"?vec(k.value,3):n(k.value,range[0],range[1],channel),...easing(k)};});
  }return result;
}
function path(raw:unknown):MotionPath {
  const p=o(raw);if(!Array.isArray(p.vertices)||p.vertices.length<2||p.vertices.length>256)throw Error("Paths need 2–256 vertices");
  const vertices=p.vertices.map(v=>vec(v,2) as [number,number]);const result:MotionPath={vertices,closed:flag(p.closed)};
  for(const channel of ["inTangents","outTangents"] as const){if(p[channel]!==undefined){const a=p[channel];if(!Array.isArray(a)||a.length!==vertices.length)throw Error("Path tangents must match vertices");result[channel]=a.map(v=>vec(v,2) as [number,number]);}}return result;
}
export function layerCraft(raw:Record<string,unknown>,duration:number):LayerCraft {
  const out:LayerCraft={};
  if(raw.parentId!==undefined)out.parentId=text(raw.parentId,80);
  if(raw.threeD!==undefined){const d=o(raw.threeD);out.threeD={z:n(d.z,-40000,40000,"depth"),rotationX:n(d.rotationX,-36000,36000,"rotation X"),rotationY:n(d.rotationY,-36000,36000,"rotation Y"),animation:keys(d.animation,duration,{z:[-40000,40000],rotationX:[-36000,36000],rotationY:[-36000,36000]})};}
  if(raw.stroke!==undefined){const d=o(raw.stroke);out.stroke={color:hex(d.color),width:n(d.width,0.1,2000,"stroke width"),fill:flag(d.fill)};}
  if(raw.vector!==undefined)out.vector=path(raw.vector);
  if(raw.trim!==undefined){const d=o(raw.trim);out.trim={start:n(d.start,0,100,"trim start"),end:n(d.end,0,100,"trim end"),offset:n(d.offset,-36000,36000,"trim offset"),animation:keys(d.animation,duration,{start:[0,100],end:[0,100],offset:[-36000,36000]})};}
  if(raw.masks!==undefined){if(!Array.isArray(raw.masks)||raw.masks.length>8)throw Error("Up to eight masks per layer");out.masks=raw.masks.map(raw=>{const d=o(raw);if(!["add","subtract"].includes(String(d.mode)))throw Error("Invalid mask mode");if(d.space!==undefined && !["source","text-box","layer-box"].includes(String(d.space)))throw Error("Invalid mask coordinate space");return{...(d.space!==undefined?{space:d.space as "source"|"text-box"|"layer-box"}:{}),path:path(d.path),mode:d.mode as "add"|"subtract",feather:n(d.feather,0,1000,"mask feather"),expansion:n(d.expansion,-10000,10000,"mask expansion"),opacity:n(d.opacity,0,100,"mask opacity"),animation:keys(d.animation,duration,{expansion:[-10000,10000],opacity:[0,100]})};});}
  if(raw.repeat!==undefined){const d=o(raw.repeat);const count=n(d.count,2,160,"copy count");if(!Number.isInteger(count))throw Error("Copy count must be an integer");out.repeat={count,position:vec(d.position,3) as Vector3,rotation:n(d.rotation,-36000,36000,"repeat rotation"),scale:n(d.scale,50,150,"repeat scale"),delay:n(d.delay,0,duration,"repeat delay")};}
  return out;
}
export function sceneCraft(raw:Record<string,unknown>,duration:number):SceneCraft {
  const out:SceneCraft={};
  if(raw.precompositions!==undefined){if(!Array.isArray(raw.precompositions)||raw.precompositions.length>8)throw Error("Up to eight precompositions");out.precompositions=raw.precompositions.map(raw=>{const g=o(raw);if(!Array.isArray(g.layerIds)||!g.layerIds.length||g.layerIds.length>80)throw Error("Choose layers for each precomposition");return{name:text(g.name,100),layerIds:g.layerIds.map(id=>text(id,80)),collapse:flag(g.collapse)};});}
  if(raw.camera!==undefined){const c=o(raw.camera);out.camera={position:vec(c.position,3) as Vector3,target:vec(c.target,3) as Vector3,zoom:n(c.zoom,1,50000,"camera zoom"),depthOfField:flag(c.depthOfField),focusDistance:n(c.focusDistance,1,100000,"focus distance"),aperture:n(c.aperture,0,1000,"aperture"),animation:keys(c.animation,duration,{position:"vector3",target:"vector3",zoom:[1,50000],focusDistance:[1,100000],aperture:[0,1000]})};}
  if(raw.motionBlur!==undefined){const m=o(raw.motionBlur);out.motionBlur={shutterAngle:n(m.shutterAngle,0,720,"shutter angle"),samples:n(m.samples,2,64,"motion samples")};if(!Number.isInteger(out.motionBlur.samples))throw Error("Motion samples must be an integer");}
  if(raw.beats!==undefined){if(!Array.isArray(raw.beats)||raw.beats.length>16)throw Error("Up to sixteen story beats");let previous=-1;out.beats=raw.beats.map(raw=>{const b=o(raw);const time=n(b.time,0,duration,"beat time");if(time<=previous)throw Error("Story beats must be chronological");previous=time;return{time,label:text(b.label,80),direction:text(b.direction,500)};});}
  if(raw.soundtrack!==undefined){if(duration>120)throw Error("Synthesized sound supports up to 120 seconds; use uploaded audio for longer films");const s=o(raw.soundtrack);if(!Array.isArray(s.cues)||s.cues.length>32)throw Error("Up to 32 sound cues");out.soundtrack={gain:n(s.gain,0,1,"soundtrack gain"),cues:s.cues.map(raw=>{const c=o(raw);if(!["rise","impact","tone","air"].includes(String(c.type)))throw Error("Unsupported sound cue");const time=n(c.time,0,duration,"sound cue time"),length=n(c.duration,0.02,duration,"sound cue duration");if(time+length>duration+0.001)throw Error("Sound cue exceeds the composition");return{time,duration:length,type:c.type as SoundCue["type"],frequency:n(c.frequency,20,12000,"frequency"),gain:n(c.gain,0,1,"cue gain"),pan:n(c.pan,-1,1,"pan")};})};}
  return out;
}

export function effectAnimation(raw:unknown,duration:number,max:number) { return keys({amount:raw},duration,{amount:[0,max]}).amount; }
