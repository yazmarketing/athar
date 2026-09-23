import { describe, expect, it } from "vitest";
import { validateScene, type MotionScene } from "../src/lib/motion/schema";
function scene(): MotionScene { return { name:"Test",width:1920,height:1080,fps:30,duration:6,background:"#222222",summary:"Editable",changes:[],layers:[{id:"title",name:"Headline",type:"text",text:"أثر",font:"ArialMT",fontSize:120,color:"#ffffff",width:1200,height:200,start:0,end:6,sourceOffset:0,position:[960,540],scale:[100,100],rotation:0,opacity:100,blend:"normal",effects:[],animation:{position:[{time:0,value:[960,640],ease:"smooth"},{time:1,value:[960,540],ease:"smooth"}]}}]}; }
describe("native motion contract",()=>{
  it("preserves exact Arabic copy and editable timed channels",()=>{expect(validateScene(scene(),[])).toEqual(scene());});
  it("accepts a zero-size invisible controller without changing child animation",()=>{
    const s=scene();
    s.layers[0].parentId="controller";
    s.layers.push({...s.layers[0],id:"controller",name:"Move lower third",type:"null",parentId:undefined,width:0,height:0,position:[0,0],animation:{}});
    const result=validateScene(s,[]);
    expect(result.layers[1]).toMatchObject({type:"null",width:100,height:100,position:[0,0]});
    expect(result.layers[0]).toEqual(s.layers[0]);
    expect(validateScene(result,[])).toEqual(result);
  });
  it.each(["rectangle","ellipse","media"] as const)("still rejects zero bounds on visible %s layers",type=>{
    const s=scene();s.layers[0].type=type;s.layers[0].assetId="asset";s.layers[0].width=0;
    expect(()=>validateScene(s,[{id:"asset",name:"Image",type:"image/png",filename:"image.png",bytes:1}])).toThrow('Layer "title" width must be between 1 and 40000');
    s.layers[0].width=100;s.layers[0].height=0;
    expect(()=>validateScene(s,[{id:"asset",name:"Image",type:"image/png",filename:"image.png",bytes:1}])).toThrow('Layer "title" height');
  });
  it.each([-1,40001,NaN,Infinity,"0",undefined])("rejects invalid controller dimensions: %s",width=>{
    const s=scene();Object.assign(s.layers[0],{type:"null",width});
    expect(()=>validateScene(s,[])).toThrow('Layer "title" width');
  });
  it.each(["expression","camera","mask"])("rejects unsupported animation channel %s",key=>{const s=scene();Object.assign(s.layers[0].animation,{[key]:[]});expect(()=>validateScene(s,[])).toThrow("Unsupported animation");});
  it("rejects missing media instead of making a placeholder",()=>{const s=scene();s.layers[0].type="media";s.layers[0].assetId="not-uploaded";expect(()=>validateScene(s,[])).toThrow("unavailable asset");});
  it("rejects duplicate and unordered keyframes",()=>{const s=scene();s.layers[0].animation.position![1].time=0;expect(()=>validateScene(s,[])).toThrow("ascending");});
  it("rejects keyframes outside composition duration",()=>{const s=scene();s.layers[0].animation.position![1].time=7;expect(()=>validateScene(s,[])).toThrow("Keyframe time");});
  it("rejects native effects without an implemented adapter",()=>{const s=scene();s.layers[0].effects=[{type:"fake" as "glow",amount:1}];expect(()=>validateScene(s,[])).toThrow("Unsupported native effect");});
  it("requires the source layer name and index to match",()=>{const s=scene();s.changes=[{index:1,name:"Old",enabled:true}];const base={id:4,name:"Existing",width:1920,height:1080,fps:30,duration:6,layers:[{index:1,name:"New",type:"text",enabled:true}]};expect(()=>validateScene(s,[],base)).toThrow("Source layer changed");});
  it("preserves the original composition settings for edits",()=>{const s=scene();const base={id:4,name:"Existing",width:1920,height:1080,fps:25,duration:6,layers:[]};expect(()=>validateScene(s,[],base)).toThrow("keeps its dimensions");});
  it("drops unexpected executable properties",()=>{const s=scene();Object.assign(s.layers[0],{script:"doBadThing()",path:"/private/file"});expect(validateScene(s,[]).layers[0]).not.toHaveProperty("script");});
});
