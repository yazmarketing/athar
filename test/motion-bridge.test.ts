import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source=readFileSync("scripts/motion/bridge-runtime.jsx.txt","utf8");
const parser=source.slice(source.indexOf("  function parse(s)"),source.indexOf("  function read(file)"));
function bridgeJSON(input: string) { const context=vm.createContext({input}); return vm.runInContext(`${parser}; stringify(parse(input));`,context); }
describe("ExtendScript data boundary",()=>{
  it("roundtrips Arabic text, escapes, vectors, booleans and null",()=>{const data={text:'أثر\\"\n\t',values:[0,-3.5,1e20],object:{enabled:true,source:null}};expect(JSON.parse(bridgeJSON(JSON.stringify(data)))).toEqual(data);});
  it.each(['{"__proto__":{}}','{"constructor":{}}','{"prototype":{}}','{}; $.evalFile("evil")','[undefined]','NaN'])('rejects executable or unsafe data %s',raw=>expect(()=>bridgeJSON(raw)).toThrow());
});
