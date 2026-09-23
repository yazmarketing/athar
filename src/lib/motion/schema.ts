import type { ReferenceTreatment } from "./reference";
import { effectAnimation, easing, layerCraft, sceneCraft, type LayerCraft, type SceneCraft } from "./advanced";
export type Keyframe = { time: number; value: number | number[]; ease: "linear" | "smooth" | "hold"; influenceIn?: number; influenceOut?: number };
export type MotionEffect = { type: "blur" | "glow" | "shadow"; amount: number; animation?: Keyframe[] };
export type MotionLayer = LayerCraft & {
  id: string; name: string; type: "text" | "rectangle" | "ellipse" | "media" | "path" | "null";
  text?: string; font?: string; fontSize?: number; color?: string; assetId?: string;
  width: number; height: number; start: number; end: number; sourceOffset: number;
  position: [number, number]; scale: [number, number]; rotation: number; opacity: number;
  blend: "normal" | "add" | "screen" | "multiply";
  animation: Partial<Record<"position" | "scale" | "rotation" | "opacity", Keyframe[]>>;
  effects: MotionEffect[];
};
export type ExistingLayerChange = { index: number; name: string; enabled: boolean; text?: string; position?: [number, number]; scale?: [number, number]; opacity?: number; rotation?: number; animation?: MotionLayer["animation"]; effects?: MotionEffect[] };
export type NativeModule = { opacity?: number; animation?: MotionLayer["animation"]; masks?: LayerCraft["masks"]; id: string; compId: number; sourceName: string; name: string; position: [number, number]; scale: [number, number]; start: number; end: number; sourceOffset: number; changes: ExistingLayerChange[] };
export type MotionScene = SceneCraft & {
  transparent?: boolean;
  nativeModules?: NativeModule[];
  name: string; width: number; height: number; fps: number; duration: number; background: string;
  summary: string; layers: MotionLayer[]; changes: ExistingLayerChange[];
  styleMatch?: { palette: string; typography: string; motion: string; layout: string; limitations: string[] };
};
export type MotionAsset = { id: string; name: string; type: string; bytes: number; filename: string; duration?: number; width?: number; height?: number; preview?: string };
export type NativeSnapshot = { updatedAt: number; version: string; capabilities?: number; activeComp: null | { id: number; name: string; width: number; height: number; duration: number; fps: number; layers: { index: number; name: string; type: string; text?: string; enabled: boolean }[] }; fonts: string[] };
export type MotionDesignJob = {
  phase?: "study" | "design"; treatment?: ReferenceTreatment;
  purpose?: "review"; id: string; instruction: string; settings: { width: number; height: number; duration: number; fps: number };
  fonts: string[]; startedAt: number; responseId?: string; submittedAt?: number;
  maxOutputTokens?: number; recoveryAttempt?: number; providerStatus?: "queued" | "in_progress";
  failureCode?: "output_limit"; previousResponseIds?: string[];
  nextCheckAt: number; lease?: string; leaseUntil?: number; notice?: string;
};
export type MotionProject = {
  id: string; name: string; mode: "create" | "edit"; createdAt: string; updatedAt: string;
  assets: MotionAsset[]; scene: MotionScene | null; revisions: { scene: MotionScene; brief: string; at: string }[];
  brief: string; status: "idle" | "designing" | "ready" | "queued" | "working" | "encoding" | "complete" | "failed";
  designJob?: MotionDesignJob;
  referenceTreatment?: ReferenceTreatment;
  referenceComp?: NativeSnapshot["activeComp"]; pendingSourceUse?: "edit" | "reference";
  frameTimes?: number[];
  frames?: string[]; review?: { summary: string; strengths: string[]; fixes: string[]; reviewedAt: string; source: string };
  sourceStudy?: { compId: number; capturedAt: string; report: string; frames: { file: string; time: number }[]; compositionCount: number; truncated: boolean; unreadableProperties?: number; capturedProperties?: number };
  error: string | null; commandId: string | null; commandKind?: "build" | "render" | "inspect"; commandAt?: number;
  baseComp: NativeSnapshot["activeComp"]; nativeCompId?: number; nativeProject?: string; preview?: string; movie?: string; master?: string;
};
const number = (v: unknown, min: number, max: number, label: string) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return v;
};
const str = (v: unknown, max: number, label: string) => { if (typeof v !== "string" || v.length > max) throw new Error(`Invalid ${label}`); return v; };
const pair = (v: unknown, label: string): [number, number] => { if (!Array.isArray(v) || v.length !== 2) throw new Error(`Invalid ${label}`); return [number(v[0], -40000, 40000, label), number(v[1], -40000, 40000, label)]; };
const obj = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Expected an object"); return v as Record<string, unknown>; };
const color = (v: unknown) => { if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error("Use six-digit hex colours"); return v; };
function effects(v: unknown, duration: number): MotionEffect[] {
  if (!Array.isArray(v) || v.length > 8) throw new Error("Up to eight effects per layer");
  return v.map(raw => { const e = obj(raw); if (!["blur", "glow", "shadow"].includes(String(e.type))) throw new Error("Unsupported native effect"); return { type: e.type as MotionEffect["type"], amount: number(e.amount, 0, e.type === "glow" ? 10 : 200, "Effect amount"), ...(e.animation !== undefined ? {animation:effectAnimation(e.animation,duration,e.type === "glow" ? 10 : 200)} : {}) }; });
}
function animation(v: unknown, duration: number): MotionLayer["animation"] {
  const input = obj(v); const result: MotionLayer["animation"] = {};
  for (const [key, value] of Object.entries(input)) {
    if (!["position", "scale", "rotation", "opacity"].includes(key) || !Array.isArray(value) || value.length > 100) throw new Error("Unsupported animation channel or too many keyframes");
    let previous = -1;
    result[key as keyof MotionLayer["animation"]] = value.map(raw => {
      const k = obj(raw); const time = number(k.time, 0, duration, "Keyframe time");
      if (time <= previous) throw new Error("Keyframes must have unique ascending times"); previous = time;
      if (!["linear", "smooth", "hold"].includes(String(k.ease))) throw new Error("Unsupported keyframe easing");
      return { time, ...easing(k), ease: k.ease as Keyframe["ease"], value: key === "position" || key === "scale" ? pair(k.value, key) : number(k.value, key === "opacity" ? 0 : -36000, key === "opacity" ? 100 : 36000, key) };
    });
  }
  return result;
}
export function validateScene(raw: unknown, assets: MotionAsset[], base: NativeSnapshot["activeComp"] = null, referenceComps: NonNullable<NativeSnapshot["activeComp"]>[] = base ? [base] : []): MotionScene {
  const s = obj(raw); if(s.transparent !== undefined && typeof s.transparent !== "boolean")throw Error("Invalid transparency setting"); const duration = number(s.duration, 0.1, 600, "Duration");
  const width = number(s.width, 64, 7680, "Width"), height = number(s.height, 64, 7680, "Height");
  if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error("Dimensions must be whole pixels");
  const fps = number(s.fps, 1, 60, "Frame rate");
  if (base && (width !== base.width || height !== base.height || duration !== base.duration || fps !== base.fps)) throw new Error("An existing composition keeps its dimensions, frame rate and duration");
  if (!Array.isArray(s.layers) || s.layers.length > 80 || !Array.isArray(s.changes) || s.changes.length > 80) throw new Error("Up to 80 layers and 80 source-layer changes per composition");
  const ids = new Set<string>();
  const layers = s.layers.map(raw => {
    const l = obj(raw); const id = str(l.id, 80, "layer id");
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw new Error("Layer ids must be unique"); ids.add(id);
    if (!["text", "rectangle", "ellipse", "media", "path", "null"].includes(String(l.type))) throw new Error("Unsupported layer type");
    const start = number(l.start, 0, duration, "Layer start"), end = number(l.end, 0, duration, "Layer end");
    if (end <= start) throw new Error("Layer end must follow its start");
    if (l.type === "media" && !assets.some(a => a.id === l.assetId)) throw new Error("A layer references an unavailable asset");
    if (!["normal", "add", "screen", "multiply"].includes(String(l.blend))) throw new Error("Unsupported blend mode");
    const craft = layerCraft(l, duration);
    if (l.type === "path" && !craft.vector) throw new Error("A path layer needs vector geometry");
    if ((craft.stroke || craft.trim || craft.vector) && !["path","rectangle","ellipse"].includes(String(l.type))) throw new Error("Vector controls need a shape layer");
    if (craft.repeat?.position[2] && !craft.threeD) throw new Error("Depth repetition needs a 3D layer");
    if(!["text","rectangle","ellipse","path"].includes(String(l.type)) && craft.masks?.some(m=>m.space === "layer-box"))throw Error("Layer-box masks require text or shape geometry");
    if(l.type !== "text" && craft.masks?.some(m=>m.space === "text-box"))throw Error("Text-box masks require a text layer");
    // Nulls have no visible bounds. AE addNull() creates a 100px control surface;
    // the adapter never uses these dimensions to size or position its children.
    // Accept zero for controllers without relaxing real shape/media bounds.
    const dimension = (value: unknown, axis: string) => {
      const size = number(value, l.type === "null" ? 0 : 1, 40000, `Layer "${id}" ${axis}`);
      return l.type === "null" && size === 0 ? 100 : size;
    };
    return { ...craft, id, name: str(l.name, 160, "layer name"), type: l.type as MotionLayer["type"],
      ...(l.type === "text" ? { text: str(l.text, 4000, "text"), font: str(l.font ?? "", 160, "font"), fontSize: number(l.fontSize, 1, 2000, "Font size") } : {}),
      ...(l.type !== "media" ? { color: color(l.color) } : { assetId: str(l.assetId, 100, "asset id") }),
      width: dimension(l.width, "width"), height: dimension(l.height, "height"), start, end,
      sourceOffset: number(l.sourceOffset ?? 0, 0, 86400, "Source offset"), position: pair(l.position, "Position"), scale: pair(l.scale, "Scale"), rotation: number(l.rotation, -36000, 36000, "Rotation"), opacity: number(l.opacity, 0, 100, "Opacity"), blend: l.blend as MotionLayer["blend"], animation: animation(l.animation, duration), effects: effects(l.effects,duration),
    };
  });
  let copies = 0; const expandedIds=new Set<string>();
  for (const l of layers) {
    copies += l.repeat?.count ?? 1;
    for(let i=0;i<(l.repeat?.count??1);i++){const id=i?`${l.id}__copy${i}`:l.id;if(expandedIds.has(id))throw Error("Repeated layer IDs collide; rename the layer");expandedIds.add(id);}
    if (l.repeat && l.start + (l.repeat.count - 1) * l.repeat.delay >= duration) throw Error("Repeated layers must start before the composition ends");
    const chain = new Set([l.id]); let parent = l.parentId;
    while (parent) { if (chain.has(parent)) throw Error("Layer parenting cannot contain cycles"); chain.add(parent); const found = layers.find(x => x.id === parent); if (!found || found.repeat) throw Error("Parent must be a single available layer"); if (!!found.threeD !== !!l.threeD) throw Error("Parent and child must use the same dimensions"); parent = found.parentId; }
  }
  if (copies > 400) throw Error("Up to 400 native layers including repeats");
  const changed = new Set<number>();
  const changes = s.changes.map(raw => {
    const c = obj(raw); const index = number(c.index, 1, 10000, "Source layer index"); const name = str(c.name, 160, "Source layer name");
    if (!base?.layers.some(l => l.index === index && l.name === name) || changed.has(index)) throw new Error("Source layer changed or is unavailable. Inspect the composition again."); changed.add(index);
    if (typeof c.enabled !== "boolean") throw new Error("Invalid layer visibility");
    if (c.text !== undefined && !base?.layers.some(l => l.index === index && l.type === "text")) throw new Error("Only text layers support copy changes");
    return { index, name, enabled: c.enabled, ...(c.text !== undefined ? { text: str(c.text, 4000, "text") } : {}), ...(c.position !== undefined ? { position: pair(c.position, "Position") } : {}), ...(c.scale !== undefined ? { scale: pair(c.scale, "Scale") } : {}), ...(c.rotation !== undefined ? { rotation: number(c.rotation, -36000, 36000, "Rotation") } : {}), ...(c.opacity !== undefined ? { opacity: number(c.opacity, 0, 100, "Opacity") } : {}), animation: animation(c.animation ?? {}, duration), effects: effects(c.effects ?? [],duration) };
  });
  let nativeModules: NativeModule[] | undefined;
  if (s.nativeModules !== undefined) {
    if (!Array.isArray(s.nativeModules) || s.nativeModules.length > 12) throw Error("Use up to 12 native reference modules");
    const moduleIds = new Set(ids);
    nativeModules = s.nativeModules.map(raw => {
      const m = obj(raw), id = str(m.id, 80, "module id");
      if (!/^[a-zA-Z0-9_-]+$/.test(id) || moduleIds.has(id)) throw Error("Native module IDs must be unique");
      moduleIds.add(id);
      const source = referenceComps.find(c => c.id === m.compId && c.name === m.sourceName);
      if (!source) throw Error("Native module must use a composition from the captured reference study");
      const start = number(m.start, 0, duration, "Module start"), end = number(m.end, 0, duration, "Module end");
      const sourceOffset = number(m.sourceOffset ?? 0, 0, source.duration, "Module source offset");
      if (end <= start || sourceOffset + end - start > source.duration + 1/source.fps) throw Error("Native module extends beyond its source duration");
      // Reuse the same source-change validation; never accept generated script,
      // property paths or edits to a layer outside this captured composition.
      const checked = validateScene({name:"Module",width:source.width,height:source.height,fps:source.fps,duration:source.duration,background:"#000000",summary:"",layers:[],changes:m.changes ?? []}, [], source);
      const moduleMasks=layerCraft(m,duration).masks;
      if(moduleMasks?.some(mask=>mask.space !== undefined && mask.space !== "source"))throw Error("Native module masks use source coordinates");
      return {opacity:number(m.opacity ?? 100,0,100,"Module opacity"),animation:animation(m.animation ?? {},duration),...(moduleMasks ? {masks:moduleMasks} : {}),id,compId:source.id,sourceName:source.name,name:str(m.name,160,"module name"),position:pair(m.position,"Module position"),scale:pair(m.scale,"Module scale"),start,end,sourceOffset,changes:checked.changes};
    });
  }
  const craft=sceneCraft(s,duration);
  const groupMembership=new Map<string,number>();
  for(const [index,group] of (craft.precompositions??[]).entries())for(const id of group.layerIds){const layer=layers.find(l=>l.id===id);if(!layer||groupMembership.has(id))throw Error("Precomposition layers must exist and belong to only one group");if(!!layer.threeD!==group.collapse)throw Error("3D precompositions must collapse transforms; 2D groups must not");groupMembership.set(id,index);}
  for(const layer of layers)if(layer.parentId && groupMembership.get(layer.id)!==groupMembership.get(layer.parentId))throw Error("Keep parent and child in the same precomposition");
  return { ...craft, ...(s.transparent !== undefined ? {transparent:s.transparent} : {}), ...(nativeModules ? {nativeModules} : {}), ...(s.styleMatch !== undefined ? { styleMatch: validateStyleMatch(s.styleMatch) } : {}), name: str(s.name, 160, "Composition name"), width, height, fps, duration, background: color(s.background), summary: str(s.summary, 2000, "Summary"), layers, changes };
}
export function validateStyleMatch(raw: unknown): NonNullable<MotionScene["styleMatch"]> {
  const s=obj(raw);
  const detail=(v:unknown)=>{const text=str(v,1600,"source style explanation");if(!text.trim())throw Error("Explain how the design follows the source style");return text;};
  if(!Array.isArray(s.limitations)||s.limitations.length>8)throw Error("List source matching limitations");
  return {palette:detail(s.palette),typography:detail(s.typography),motion:detail(s.motion),layout:detail(s.layout),limitations:s.limitations.map(detail)};
}
