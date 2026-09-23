import type { Keyframe, MotionLayer, MotionScene } from "../../src/lib/motion/schema";
/** Authored starting composition. Uses the actual supplied marks, never reconstructed lettering. */
export function atharIdent(markId: string, wordmarkId: string): MotionScene {
  const k=(time:number,value:number|number[],influenceIn=70,influenceOut=70):Keyframe=>({time,value,ease:"smooth",influenceIn,influenceOut});
  const layer=(id:string,more:Partial<MotionLayer>):MotionLayer=>({id,name:id,type:"rectangle",...(more.type === "media" ? {} : {color:"#eff0df"}),width:100,height:100,start:0,end:7,sourceOffset:0,position:[960,540],scale:[100,100],rotation:0,opacity:100,blend:"normal",animation:{},effects:[],...more});
  const layers:MotionLayer[]=[];
  layers.push(layer("hero-mark",{name:"01 · ATHAR original mark · hero hold",type:"media",assetId:markId,width:2000,height:1200,start:4.65,position:[970,472],scale:[55,55],animation:{opacity:[k(4.65,0),k(5.25,100)],scale:[k(4.65,[64,64]),k(5.35,[55,55],85)],position:[k(4.65,[970,485]),k(5.35,[970,472])]},effects:[]}));
  layers.push(layer("hero-wordmark",{name:"02 · Original wordmark · resolve",type:"media",assetId:wordmarkId,width:2000,height:720,start:5.15,position:[960,716],scale:[36,36],animation:{opacity:[k(5.15,0),k(5.65,100)],position:[k(5.15,[960,731]),k(5.65,[960,716])]}}));
  layers.push(layer("imprint",{name:"03 · Imprint wave",type:"ellipse",width:500,height:500,start:4.8,end:6.35,stroke:{color:"#d7e6a5",width:1.2,fill:false},animation:{scale:[k(4.8,[20,20]),k(6.35,[380,380],90)],opacity:[k(4.8,0),k(4.95,45),k(6.35,0)]}}));
  // Eight depth planes use actual logo fragments; a single compact repeat expands to editable layers.
  layers.push(layer("logo-depth",{name:"04 · Original mark · depth echoes",type:"media",assetId:markId,width:2000,height:1200,start:0.35,end:4.7,threeD:{z:150,rotationX:0,rotationY:-12,animation:{rotationY:[k(0.35,-42),k(2.8,8),k(4.6,0)]}},scale:[180,180],repeat:{count:8,position:[0,0,650],rotation:0,scale:100,delay:0},masks:[{path:{vertices:[[700,550],[1280,550],[1280,800],[700,800]],closed:true},mode:"add",feather:3,expansion:0,opacity:100,animation:{}}],animation:{opacity:[k(0.35,0),k(1.2,14),k(3.8,10),k(4.65,0)]}}));
  for(let family=0;family<6;family++) {
    const width=950+family*170,height=700+family*105;
    const vertices:[number,number][]=[[-width/2,-height/2],[width/2,-height/2],[width/2,height/2],[-width/2,height/2]];
    layers.push(layer(`trace-${family}`,{name:`TRACE ${family+1} · depth procession`,type:"path",width,height,vector:{vertices,closed:true},stroke:{color:family===2?"#d7e6a5":family%2?"#8d9995":"#f0eddd",width:family===2?2:1.1,fill:false},start:0.7,end:5.25,
      threeD:{z:family*115,rotationX:0,rotationY:0,animation:{}},rotation:family*11-25,
      repeat:{count:18,position:[0,0,390],rotation:2.4,scale:100,delay:0},
      trim:{start:0,end:0,offset:family*35,animation:{end:[k(0.7+family*0.06,0),k(2+family*0.06,100)],offset:[k(1,0),k(4.6,70)]}},
      animation:{rotation:[k(0.7,family*11-25),k(3.5,family*11+15),k(5.2,0)],opacity:[k(0.7,0),k(1.6,55),k(4.2,65),k(4.9,0)],scale:[k(0.7,[100,100]),k(4.1,[100,100]),k(5.2,[12,12],90)]}
    }));
  }
  layers.push(layer("macro-mark",{name:"OPENING · Inside the approved mark",type:"media",assetId:markId,width:2000,height:1200,end:1.65,threeD:{z:0,rotationX:0,rotationY:-22,animation:{rotationY:[k(0,-22),k(1.65,0)]}},position:[400,930],scale:[650,650],animation:{opacity:[k(0,0),k(0.2,100),k(1,80),k(1.65,0)],scale:[k(0,[650,650]),k(1.65,[190,190],85)],position:[k(0,[400,930]),k(1.65,[960,540])]}}));
  return {name:"ATHAR — Enter the Trace · Studio study",width:1920,height:1080,duration:7,fps:30,background:"#101715",summary:"Seven-second authored study using the approved Athar assets. Macro opening, real camera travel through 3D vector traces and logo fragments, a restrained imprint wave and a readable final lockup. Native editable paths, trim animation, masks, depth planes, camera and a synthesized stereo score. This is a starting study for review, not an automatically quality-approved final.",layers,changes:[],motionBlur:{shutterAngle:210,samples:8},
    camera:{position:[960,540,-1400],target:[960,540,2000],zoom:1400,depthOfField:true,focusDistance:2000,aperture:5,animation:{position:[k(0,[960,540,-1400]),k(1.2,[900,580,-800],25,35),k(3.8,[1000,495,3300],20,30),k(4.9,[960,540,5600],65,70)],target:[k(0,[960,540,2000]),k(3.8,[960,540,5400]),k(4.9,[960,540,8000])],focusDistance:[k(0,1600),k(3.8,1800),k(4.9,2200)]}},
    beats:[{time:0,label:"Enter",direction:"A close crop of the actual mark fills the frame."},{time:1.2,label:"Separate",direction:"The mark opens into a dimensional field of luminous traces."},{time:3.2,label:"Accelerate",direction:"Camera travels through the depth corridor; controlled density and light."},{time:4.6,label:"Resolve",direction:"Traces recede as the original mark returns. One imprint wave."},{time:5.65,label:"Leave a trace",direction:"Still, legible approved mark and wordmark hold to the end."}],
    soundtrack:{gain:0.65,cues:[{time:0,duration:4.9,type:"tone",frequency:52,gain:0.25,pan:0},{time:0.6,duration:1.8,type:"air",frequency:400,gain:0.22,pan:-0.25},{time:2,duration:2.7,type:"rise",frequency:160,gain:0.4,pan:0.2},{time:4.65,duration:1.8,type:"impact",frequency:65,gain:0.8,pan:0},{time:4.85,duration:2.1,type:"tone",frequency:260,gain:0.12,pan:0}]}
  };
}
