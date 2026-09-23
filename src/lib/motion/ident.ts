import { validateScene, type MotionScene } from "./schema";
import study from "./ident-scene.json";
/** A study refined from native frame critique, copied and validated independently per project. */
export function atharIdent(markId: string, wordmarkId: string): MotionScene {
  const scene = structuredClone(study);
  for(const layer of scene.layers) {
    if("assetId" in layer && layer.assetId === "athar-mark")layer.assetId=markId;
    if("assetId" in layer && layer.assetId === "athar-wordmark")layer.assetId=wordmarkId;
  }
  return validateScene(scene,[markId,wordmarkId].map(id=>({id,name:id,filename:`${id}.png`,type:"image/png",bytes:0})));
}
