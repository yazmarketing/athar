import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
const exec = promisify(execFile);
const formats: Record<string,string> = { ".png":"image2", ".jpg":"image2", ".jpeg":"image2", ".webp":"image2", ".mp4":"mov", ".mov":"mov", ".wav":"wav", ".mp3":"mp3" };
export async function inspectAsset(file: string, type: string) {
  if (!ffmpegPath) throw new Error("The media decoder is unavailable");
  const format = formats[path.extname(file).toLowerCase()]; if (!format) throw new Error("Unsupported asset format");
  const args = ["-hide_banner", "-v", "info", "-protocol_whitelist", "file,pipe", "-f", format, "-i", file];
  const visual = !type.startsWith("audio");
  const preview = `${file}.jpg`;
  try {
    const { stderr } = await exec(ffmpegPath, [...args, ...(visual ? ["-frames:v","1","-vf","scale=768:768:force_original_aspect_ratio=decrease","-an","-y",preview] : ["-t","1","-f","null","-"])], { timeout:45000, maxBuffer:2*1024*1024 });
    const duration = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
    const size = stderr.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
    return { ...(duration ? { duration:Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3]) } : {}), ...(size ? { width:Number(size[1]),height:Number(size[2]) } : {}), ...(visual ? { preview:path.basename(preview) } : {}) };
  } catch { throw new Error("This asset could not be decoded. Export a standard PNG/JPEG, H.264 MP4, WAV or MP3 copy and upload it again."); }
}
export async function assetImage(file: string) { return `data:${path.extname(file).toLowerCase() === ".png" ? "image/png" : "image/jpeg"};base64,${(await readFile(file)).toString("base64")}`; }
/** Keep a dozen native reference stills within a practical vision request size. */
export async function sourceReferenceImage(file: string) {
  if(!ffmpegPath)throw Error("The reference image decoder is unavailable");
  const {stdout}=await exec(ffmpegPath,["-v","error","-protocol_whitelist","file,pipe","-i",file,"-frames:v","1","-vf","scale=1280:1280:force_original_aspect_ratio=decrease","-q:v","2","-f","image2pipe","-vcodec","mjpeg","pipe:1"],{encoding:"buffer",timeout:30000,maxBuffer:8*1024*1024});
  return `data:image/jpeg;base64,${stdout.toString("base64")}`;
}
export async function decodeSourceFrame(source: string, destination: string) {
  if(!ffmpegPath)throw Error("The reference frame decoder is unavailable");
  await exec(ffmpegPath,["-v","error","-protocol_whitelist","file,pipe","-i",source,"-frames:v","1","-y",destination],{timeout:20000,maxBuffer:2*1024*1024});
}
export async function encodePreview(source: string, destination: string) {
  if (!ffmpegPath) throw new Error("The video encoder is unavailable");
  await exec(ffmpegPath,["-hide_banner","-loglevel","error","-protocol_whitelist","file,pipe","-i",source,"-c:v","libx264","-crf","18","-preset","fast","-pix_fmt","yuv420p","-vf","scale=trunc(iw/2)*2:trunc(ih/2)*2","-c:a","aac","-b:a","192k","-movflags","+faststart","-y",destination],{timeout:600000,maxBuffer:2*1024*1024});
}

export async function normalizeWebp(source: string, destination: string) {
  if(!ffmpegPath) throw new Error("The media decoder is unavailable");
  await exec(ffmpegPath,["-hide_banner","-loglevel","error","-protocol_whitelist","file,pipe","-f","image2","-i",source,"-frames:v","1","-y",destination],{timeout:45000,maxBuffer:2*1024*1024});
}

/** Sample the completed film, so a final render never reuses stale build stills. */
export async function sampleRenderedFrames(movie: string, directory: string, duration: number) {
  if (!ffmpegPath) throw Error("The media decoder is unavailable");
  for(let i=0;i<5;i++) {
    await exec(ffmpegPath,["-hide_banner","-loglevel","error","-protocol_whitelist","file,pipe","-ss",String(duration*(i*0.2+0.1)),"-i",movie,"-frames:v","1","-y",path.join(directory,`frame-${i}.png`)],{timeout:45000,maxBuffer:2*1024*1024});
  }
}
