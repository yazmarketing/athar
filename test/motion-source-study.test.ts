import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { validateStyleMatch } from "../src/lib/motion/schema";
const runtime=readFileSync("scripts/motion/bridge-runtime.jsx.txt","utf8");
const reader=runtime.slice(runtime.indexOf("  function studyValue("),runtime.indexOf("  function inspectSource("));
describe("native source evidence",()=>{
  it("maps a centre-out text mask to the real font anchor without changing its tangents or source-space masks",()=>{
    const parser=runtime.slice(runtime.indexOf("  function parse(s)"),runtime.indexOf("  function read(file)"));
    const geometry=runtime.slice(runtime.indexOf("  function maskGeometry("),runtime.indexOf("  function masks("));
    const result=JSON.parse(vm.runInNewContext(`${parser}\n${geometry}\nvar mask={space:'text-box',path:{vertices:[[419,-400],[421,508]],inTangents:[[0,0],[1,2]],closed:false}};JSON.stringify({box:maskGeometry({type:'text',width:840,height:108},mask,[0,-30]),original:mask.path,source:maskGeometry({type:'text',width:840,height:108},{space:'source',path:mask.path},[0,-30])});`));
    expect(result.box.vertices).toEqual([[-1,-484],[1,424]]);expect(result.box.inTangents).toEqual([[0,0],[1,2]]);expect(result.original.vertices).toEqual([[419,-400],[421,508]]);expect(result.source).toEqual(result.original);
  });
  it.each([false,true])("restores existing render-queue flags and removes temporary items, including failure=%s",fail=>{
    const capture=runtime.slice(runtime.indexOf("  function renderStills("),runtime.indexOf("  function inspectSource("));
    const result=JSON.parse(vm.runInNewContext(`${capture}
      var RQItemStatus={QUEUED:1,DONE:2};function File(p){this.path=p;}
      var original={status:1,render:true},existing=[original],made=[];
      var q={numItems:1,item:function(i){return existing[i-1];},items:{add:function(){var om={applyTemplate:function(){},setSettings:function(){}};var item={status:1,outputModule:function(){return om;},remove:function(){existing.splice(existing.indexOf(item),1);}};existing.push(item);made.push(item);return item;}},render:function(){if(original.render)throw Error('Existing job was not paused');${fail?"throw Error('Native render failed');":"for(var i=0;i<made.length;i++)made[i].status=2;"}}};
      var app={project:{renderQueue:q}},failed=false;
      try{renderStills({frameRate:30},[{time:0.1},{time:1}],'/safe','source-');}catch(e){failed=true;}
      JSON.stringify({failed:failed,restored:original.render,remaining:existing.length,times:made.map(function(i){return i.timeSpanStart;}),durations:made.map(function(i){return i.timeSpanDuration;})});`));
    expect(result).toEqual({failed:fail,restored:true,remaining:1,times:[0.1,1],durations:[1/30,1/30]});
  });
  it("captures native colour and easing and skips disabled effects without reading their values",()=>{
    const result=vm.runInNewContext(`${reader}
      var color={name:'Fill',matchName:'ADBE Fill Color',valueAtTime:function(){return [1,0,0,1];},numKeys:2,keyTime:function(i){return i/2;},keyValue:function(){return [1,0,0,1];},keyInInterpolationType:function(){return 'BEZIER';},keyOutInterpolationType:function(){return 'BEZIER';},keyInTemporalEase:function(){return [{speed:20,influence:80}];},keyOutTemporalEase:function(){return [{speed:10,influence:65}];}};
      var disabled={name:'Unused shadow',matchName:'shadow',enabled:false,valueAtTime:function(){throw Error('Must not inspect disabled effect');}};
      var effects={name:'Effects',matchName:'ADBE Effect Parade',numProperties:2,property:function(i){return i===1?color:disabled;}};
      var layer={numProperties:1,property:function(){return effects;}};
      JSON.stringify(studyProperties(layer,0,6,{left:100,truncated:false},0));`);
    const properties=JSON.parse(result)[0].children;
    expect(properties[0]).toMatchObject({value:[1,0,0,1],keyCount:2,keys:[{time:0.5,inEase:[{speed:20,influence:80}]},{time:1,outEase:[{speed:10,influence:65}]}]});
    expect(properties[1]).toMatchObject({name:"Unused shadow",matchName:"shadow",enabled:false,unreadable:true});
  });
  it("captures font and tracking while excluding arbitrary object fields",()=>{
    const result=JSON.parse(vm.runInNewContext(`${reader};JSON.stringify(studyValue({text:'أثر',font:'DMI',fontSize:90,fillColor:[1,0,0],tracking:15,script:'do not export me'}));`));
    expect(result).toMatchObject({text:"أثر",font:"DMI",fontSize:90,fillColor:[1,0,0],tracking:15});expect(result).not.toHaveProperty("script");
  });
  it("requires source-specific explanations rather than an empty match claim",()=>{
    expect(()=>validateStyleMatch({palette:"",typography:"a",motion:"b",layout:"c",limitations:[]})).toThrow("Explain");
    expect(()=>validateStyleMatch({palette:"red",typography:"a",motion:"b",layout:"c"})).toThrow("limitations");
  });
});
