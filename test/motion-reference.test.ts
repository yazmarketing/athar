import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { validateScene, type MotionScene } from "@/lib/motion/schema";
import { motionPreviewTimes } from "@/lib/motion/reference";
const reference={id:54,name:"Brand film",width:1920,height:1080,duration:30,fps:30,layers:[{index:1,name:"Headline",type:"text",enabled:true}]};
const nativeModule={id:"reused",compId:54,sourceName:"Brand film",name:"Brand reveal",position:[540,960],scale:[56,56],start:0,end:6,sourceOffset:0,changes:[{index:1,name:"Headline",enabled:true,text:"New exact copy"}]};
const scene={name:"New reel",width:1080,height:1920,fps:30,duration:6,background:"#000000",summary:"Native reuse",layers:[],changes:[],nativeModules:[nativeModule]};
describe("native reference authoring",()=>{
 it("allows a new social deliverable while preserving reference settings",()=>{
  const result=validateScene(scene,[],null,[reference]);expect(result.width).toBe(1080);expect(result.nativeModules?.[0].changes[0].text).toBe("New exact copy");expect(reference.width).toBe(1920);
 });
 it("rejects unknown compositions, changed layer names and unavailable source time",()=>{
  expect(()=>validateScene(scene,[])).toThrow("captured reference");
  expect(()=>validateScene({...scene,nativeModules:[{...nativeModule,changes:[{index:1,name:"Invented",enabled:true}]}]},[],null,[reference])).toThrow("unavailable");
  expect(()=>validateScene({...scene,nativeModules:[{...nativeModule,sourceOffset:29}]},[],null,[reference])).toThrow("duration");
 });
 it("preserves native effects, keyframes and original text when adapting a copy",()=>{
  const runtime=readFileSync("scripts/motion/bridge-runtime.jsx.txt","utf8");
  const helpers=runtime.slice(runtime.indexOf("  function applySourceChanges("),runtime.indexOf("  function build(cmd)"));
  const result=vm.runInNewContext(`${helpers};
    var nativeText={text:'Original'}, copiedText={text:'Original'}, changed=0;
    function textProperty(doc){return {numKeys:0,expressionEnabled:false,value:doc,setValue:function(v){changed++;}};}
    var originalLayer={name:'Headline',nativeEffects:['AutoFill'],keys:[1,2],property:function(){return {property:function(){return textProperty(nativeText);}};}};
    var copiedLayer={name:'Headline',nativeEffects:originalLayer.nativeEffects,keys:originalLayer.keys,property:function(){return {property:function(){return textProperty(copiedText);}};}};
    var duplicate={layer:function(){return copiedLayer;}};
    var source={name:'Brand film',numLayers:1,width:1920,height:1080,duration:30,frameRate:30,layer:function(){return originalLayer;},duplicate:function(){return duplicate;}};
    function compById(){return source;} function transforms(){} function effects(){}
    var wrapper={property:function(){return {property:function(){return {setValue:function(){}};}};}};
    var output={layers:{add:function(c){if(c!==duplicate)throw Error('Expected isolated copy');return wrapper;}}},created=[];
    addNativeModules(output,${JSON.stringify([nativeModule])},${JSON.stringify([reference])},created);
    JSON.stringify({original:nativeText.text,copy:copiedText.text,effects:copiedLayer.nativeEffects,keys:copiedLayer.keys,created:created.length,wrapper:wrapper.name,changed:changed});`);
  expect(JSON.parse(result)).toEqual({original:"Original",copy:"New exact copy",effects:["AutoFill"],keys:[1,2],created:1,wrapper:"Brand reveal",changed:1});
 });
 it("does not destroy source-text expressions to force a copy change",()=>{
  const runtime=readFileSync("scripts/motion/bridge-runtime.jsx.txt","utf8");const helpers=runtime.slice(runtime.indexOf("  function applySourceChanges("),runtime.indexOf("  function build(cmd)"));
  expect(()=>vm.runInNewContext(`${helpers};var c={layer:function(){return {name:'Headline',property:function(){return {property:function(){return {numKeys:0,expressionEnabled:true};}};}};}};applySourceChanges(c,[{index:1,name:'Headline',enabled:true,text:'New'}]);`)).toThrow("will not be overwritten");
 });
 it("samples the designed entrance and exit rather than only the long hold",()=>{
  const s={...validateScene(scene,[],null,[reference]),duration:30,beats:[{time:4.5,label:"Hero hold",direction:"Read"},{time:26,label:"Exit",direction:"Out"}]} as MotionScene;
  const times=motionPreviewTimes(s);expect(times).toHaveLength(5);expect(times[1]).toBe(4.5);expect(times[3]).toBe(26);expect(times[4]).toBe(26.3);
 });
});

it("exports alpha via a native template instead of writing read-only Channels settings",()=>{
 const runtime=readFileSync("scripts/motion/bridge-runtime.jsx.txt","utf8");const render=runtime.slice(runtime.indexOf("  function render(cmd)"),runtime.indexOf("  // Explicit source studies"));
 const result=vm.runInNewContext(`${render};var selected='',removed=false,settings=[];
 var om={templates:['Lossless','High Quality with Alpha'],applyTemplate:function(t){selected=t;},setSettings:function(s){if(s.Channels)throw Error('Channels is read-only');settings.push(s);}};
 var item={status:'DONE',outputModule:function(){return om;},remove:function(){removed=true;}};
 var comp={};function compById(){return comp;}function File(p){this.path=p;}
 var RQItemStatus={QUEUED:'QUEUED',DONE:'DONE'},app={project:{save:function(){},renderQueue:{numItems:0,items:{add:function(){return item;}},render:function(){}}}};
 render({compId:1,scene:{transparent:true},outputDir:'/safe'});JSON.stringify({selected:selected,removed:removed,settings:settings});`);
 expect(JSON.parse(result)).toEqual({selected:"High Quality with Alpha",removed:true,settings:[{"Output Audio":"On"}]});
});

it("maps shape design-box masks to the centered native geometry without mutating authored paths",()=>{
 const runtime=readFileSync("scripts/motion/bridge-runtime.jsx.txt","utf8");
 const parser=runtime.slice(runtime.indexOf("  function parse("),runtime.indexOf("  function read("));
 const masks=runtime.slice(runtime.indexOf("  function maskGeometry("),runtime.indexOf("  function masks("));
 const result=vm.runInNewContext(`${parser};${masks};var mask={space:'layer-box',path:{vertices:[[0,0],[404,146]],closed:false}};JSON.stringify({mapped:maskGeometry({type:'rectangle',width:404,height:146},mask,[0,0]),original:mask.path});`);
 expect(JSON.parse(result)).toMatchObject({mapped:{vertices:[[-202,-73],[202,73]]},original:{vertices:[[0,0],[404,146]]}});
});
