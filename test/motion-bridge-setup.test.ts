import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it } from "vitest";
import { compileBridge } from "../src/lib/motion/bridge";
const template=readFileSync("scripts/motion/bridge-runtime.jsx.txt","utf8");
it("produces executable ExtendScript with the exact workspace path",()=>{
  const root="/Users/Test $& \\\" Name/athar/.athar/motion/123";
  const script=compileBridge(template,root);const declaration=script.match(/var ROOT = (.+);/)![1];
  expect(vm.runInNewContext(declaration)).toBe(root);expect(script).not.toContain('= __ATHAR_ROOT__');expect(script).not.toContain('"__ATHAR_WORKSPACE_ROOT__"');new vm.Script(script);
});
it("fails closed when template marker is missing or duplicated",()=>{expect(()=>compileBridge("var ROOT = undefined;","/tmp/example")).toThrow("template");expect(()=>compileBridge(template+template,"/tmp/example")).toThrow("template");});
it("direct template execution shows guidance rather than an undefined identifier error",()=>{let message="";vm.runInNewContext(template,{alert:(s:string)=>{message=s;}});expect(message).toContain("prepare the bridge");});
it("local launcher has no unresolved workspace variable",()=>{const launcher=readFileSync("scripts/motion/bridge.jsx","utf8");expect(launcher).not.toContain("__ATHAR_ROOT__");expect(launcher).toContain("last-bridge.txt");new vm.Script(launcher);});
