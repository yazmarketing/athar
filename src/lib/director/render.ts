import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";
import { DIRECTOR_FORMATS, directorDuration, type DirectorCheck, type DirectorProject, type DirectorScene } from "../director-types";
import { probeMedia, runFfmpeg } from "./media";
import { DirectorError, MAX_SCENES, MAX_SECONDS } from "./store";

type Options = {
  project: DirectorProject;
  assetPath: (id: string) => Promise<string>;
  outputDir: string;
  onProgress: (progress: number, stage: string) => Promise<void>;
  signal?: AbortSignal;
};
export type DirectorRenderResult = { filePath: string; thumbnailPath: string; width: number; height: number; duration: number; checks: DirectorCheck[] };
const FPS = 30;
const arabic = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;
function xml(x: string) { return x.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!)); }
function assText(x: string) { return x.replace(/\\/g, "＼").replace(/[{}]/g, "").replace(/\r?\n/g, "\\N"); }
function assTime(s: number) { const cs = Math.round(Math.max(0, s) * 100); return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`; }
export function wrapDirectorText(text: string, max: number): string {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + word.length + 1 > max) { lines.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
  }
  return lines.join("\n");
}
export function directorAss(scene: DirectorScene, project: DirectorProject, width: number, height: number, index: number): string {
  const portrait = height > width;
  const card = !scene.assetId;
  const style = project.settings.style;
  const centered = style === "cinematic";
  const kinetic = style === "kinetic";
  const margin = Math.round(width * 0.075);
  const titleArabic = arabic.test(scene.title);
  const captionArabic = arabic.test(scene.caption);
  const fontSize = titleArabic ? (portrait ? 142 : 148) : (portrait ? 62 : 72);
  const titleSize = Math.max(40, Math.round(fontSize * (kinetic ? 1.18 : style === "minimal" ? .9 : 1)) - (scene.title.length > 100 ? 14 : 0));
  const title = assText(wrapDirectorText(scene.title, portrait ? (titleArabic ? 26 : 22) : (titleArabic ? 40 : 36)));
  const caption = assText(wrapDirectorText(scene.caption, portrait ? 40 : 70));
  const accent = project.settings.accent.replace("#", "");
  const colour = `&H00${accent.slice(4, 6)}${accent.slice(2, 4)}${accent.slice(0, 2)}`;
  const align = centered ? 8 : titleArabic ? 9 : 7;
  const titleX = centered ? Math.round(width / 2) : titleArabic ? width - margin : margin;
  const titleY = card ? Math.round(height * (centered ? .4 : kinetic ? .31 : portrait ? .37 : .32)) : Math.round(height * (centered ? .16 : .14));
  const end = assTime(scene.duration);
  const brand = assText(project.settings.brandName);
  const number = `${String(index + 1).padStart(2, "0")}  /  ${String(project.scenes.length).padStart(2, "0")}`;
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Title,${titleArabic ? "Aref Ruqaa" : "Unbounded"},${titleSize},${kinetic ? colour : "&H00FFFFFF"},&H00FFFFFF,&H80000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,1,${align},${margin},${margin},0,1\nStyle: Caption,${captionArabic ? "Aref Ruqaa" : "Unbounded"},${captionArabic ? 78 : 31},&H00FFFFFF,&H00FFFFFF,&HB0000000,&H90000000,0,0,0,0,100,100,0,0,1,1,1,2,${margin},${margin},${Math.round(height * 0.12)},1\nStyle: Brand,${arabic.test(brand) ? "Aref Ruqaa" : "Unbounded"},${arabic.test(brand) ? 40 : 23},${colour},${colour},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,7,${margin},${margin},${Math.round(height * 0.055)},1\nStyle: Counter,Unbounded,18,&H99FFFFFF,&H99FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,9,${margin},${margin},${Math.round(height * 0.06)},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${title ? `Dialogue: 1,0:00:00.00,${end},Title,,0,0,0,,{\\fad(240,180)\\move(${titleX},${titleY + 16},${titleX},${titleY},0,420)}${title}\n` : ""}${caption ? `Dialogue: 2,0:00:00.00,${end},Caption,,0,0,0,,{\\fad(300,160)}${caption}\n` : ""}${brand ? `Dialogue: 3,0:00:00.00,${end},Brand,,0,0,0,,{\\fad(180,160)}${brand}\n` : ""}Dialogue: 3,0:00:00.00,${end},Counter,,0,0,0,,${style === "minimal" || centered ? "" : number}\n`;
}
async function copyFonts(dir: string) {
  await mkdir(dir, { recursive: true });
  for (const family of ["Aref-Ruqaa", "Unbounded"]) {
    const base = join(process.cwd(), "public", "fonts", family);
    for (const name of await readdir(base)) if (name.endsWith(".ttf")) await copyFile(join(base, name), join(dir, name));
  }
}
async function artwork(path: string, width: number, height: number, scene: DirectorScene, p: DirectorProject, index: number, overlay = false) {
  const accent = xml(p.settings.accent); const bg = xml(scene.background);
  const kinetic = p.settings.style === "kinetic";
  const minimal = p.settings.style === "minimal";
  const cinematic = p.settings.style === "cinematic";
  const svg = minimal && !overlay ? `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${bg}"/><rect x="${width * .075}" y="${height * .105}" width="${width * .06}" height="3" fill="${accent}"/></svg>` : overlay
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".66"/><stop offset=".45" stop-color="#000" stop-opacity=".04"/><stop offset="1" stop-color="#000" stop-opacity=".76"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#v)"/>${cinematic ? `<rect width="${width}" height="${height * .055}" fill="#000"/><rect y="${height * .945}" width="${width}" height="${height * .055}" fill="#000"/>` : `<rect x="${width * .075}" y="${height * .105}" width="${width * .08}" height="4" fill="${accent}"/>`}</svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><radialGradient id="g"><stop offset="0" stop-color="${accent}" stop-opacity=".36"/><stop offset="1" stop-color="${bg}" stop-opacity="0"/></radialGradient><linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="#080c0b"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#l)"/><ellipse cx="${width * .83}" cy="${height * .28}" rx="${width * .9}" ry="${height * .55}" fill="url(#g)"/>${kinetic ? `<path d="M ${width * .72} 0 L ${width} 0 L ${width} ${height} L ${width * .22} ${height} Z" fill="${accent}" opacity=".11"/><path d="M 0 ${height * .26} H ${width * .17}" stroke="${accent}" stroke-width="16"/>` : ""}<g stroke="${accent}" fill="none" opacity="${cinematic ? .035 : .18}" stroke-width="${kinetic ? 4 : 1}"><circle cx="${width * .9}" cy="${height * .76}" r="${width * .64}"/><circle cx="${width * .9}" cy="${height * .76}" r="${width * .52}"/><path d="M ${width * .075} ${height * .22} H ${width * .925} M ${width * .075} ${height * .79} H ${width * .925}"/></g><rect x="${width * .075}" y="${height * .105}" width="${width * (.06 + index % 3 * .025)}" height="${kinetic ? 8 : 4}" fill="${accent}"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path);
}
function filterPath(path: string) { return path.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "'\\''").replace(/,/g, "\\,").replace(/\[/g, "\\[").replace(/\]/g, "\\]"); }

export async function renderDirector(opts: Options): Promise<DirectorRenderResult> {
  const { project: p, assetPath, outputDir, onProgress, signal } = opts;
  const duration = directorDuration(p.scenes);
  if (!p.scenes.length || p.scenes.length > MAX_SCENES || duration > MAX_SECONDS + .01) throw new DirectorError("Add 1–24 scenes totaling no more than 90 seconds before rendering");
  const { width, height } = DIRECTOR_FORMATS[p.settings.format];
  await mkdir(outputDir, { recursive: true });
  const work = join(outputDir, `work-${randomUUID()}`); await mkdir(work);
  const fonts = join(work, "fonts"); await copyFonts(fonts);
  const scenePaths: string[] = [];
  let sourceAudioPresent = false;
  for (const [index, scene] of p.scenes.entries()) {
    signal?.throwIfAborted();
    await onProgress(32 + index / p.scenes.length * 46, `Composing scene ${index + 1} of ${p.scenes.length}`);
    const asset = p.assets.find((a) => a.id === scene.assetId);
    const source = asset ? await assetPath(asset.id) : join(work, `card-${index}.png`);
    const ass = join(work, `scene-${index}.ass`); const shade = join(work, `shade-${index}.png`);
    const output = join(work, `scene-${index}.mp4`);
    await writeFile(ass, directorAss(scene, p, width, height, index));
    if (!asset) await artwork(source, width, height, scene, p, index);
    await artwork(shade, width, height, scene, p, index, true);
    const video = asset?.kind === "video";
    const info = video ? await probeMedia(source, signal) : null;
    const hasSourceAudio = !!(info?.hasAudio && p.settings.preserveSourceAudio);
    sourceAudioPresent ||= hasSourceAudio;
    const args = ["-y", "-hide_banner", "-loglevel", "error", "-threads", "2"];
    if (video) args.push("-ss", String(scene.sourceIn), "-i", source);
    else args.push("-loop", "1", "-framerate", String(FPS), "-i", source);
    args.push("-loop", "1", "-i", shade, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
    const size = scene.fit === "contain"
      ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${scene.background}`
      : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    const drift = !video && p.settings.style !== "minimal" ? `,zoompan=z='min(1+on*${p.settings.style === "kinetic" ? .00018 : p.settings.style === "cinematic" ? .000025 : .00005},1.07)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:fps=${FPS}:s=${width}x${height}` : "";
    const fade = scene.transition === "fade" ? `,fade=t=in:st=0:d=0.18,fade=t=out:st=${Math.max(0, scene.duration - .18)}:d=0.18` : "";
    const filters = `[0:v]${size},setsar=1,fps=${FPS}${drift}[base];[base][1:v]overlay=0:0:shortest=1,ass='${filterPath(ass)}':fontsdir='${filterPath(fonts)}'${fade},format=yuv420p[v];[${hasSourceAudio ? "0:a" : "2:a"}]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${scene.duration},afade=t=in:d=0.04,afade=t=out:st=${Math.max(0, scene.duration - .08)}:d=0.08[a]`;
    args.push("-filter_complex_threads", "2", "-filter_complex", filters, "-map", "[v]", "-map", "[a]", "-t", String(scene.duration), "-r", String(FPS), "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", output);
    await runFfmpeg(args, { signal, timeout: 15 * 60_000 });
    scenePaths.push(output);
  }
  await onProgress(82, "Mixing soundtrack and finishing the master");
  const list = join(work, "edit.txt");
  await writeFile(list, scenePaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n"));
  const out = join(outputDir, `${randomUUID()}.mp4`);
  const music = p.audioAssetId ? p.assets.find((a) => a.id === p.audioAssetId && a.kind === "audio") : null;
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list];
  const normalization = duration >= 3 ? "loudnorm=I=-16:TP=-1.5:LRA=11" : "alimiter=limit=0.84:level=false";
  if (music) {
    if (p.settings.soundtrackLoop !== false) args.push("-stream_loop", "-1");
    args.push("-i", await assetPath(music.id), "-filter_complex", `[1:a]volume=${p.audioVolume},afade=t=in:d=0.35,afade=t=out:st=${Math.max(0, duration - 1)}:d=1[m];[0:a][m]amix=inputs=2:duration=first:normalize=0,${normalization}[a]`, "-map", "0:v", "-map", "[a]");
  } else {
    args.push("-map", "0:v", "-map", "0:a");
    // FFmpeg loudnorm can produce NaN on short digital silence. A title-only
    // edit has intentionally silent audio and must not be normalized.
    if (sourceAudioPresent) args.push("-af", normalization);
  }
  args.push("-t", String(duration), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out);
  await runFfmpeg(args, { signal, timeout: 5 * 60_000 });
  await onProgress(94, "Checking the finished export");
  const verified = await probeMedia(out, signal);
  if (!verified.hasVideo || verified.width !== width || verified.height !== height || Math.abs(verified.duration - duration) > .3) throw new DirectorError("The export did not pass its resolution and duration checks. Your edit is saved.", 500);
  const thumbnailPath = join(outputDir, `${basename(out, ".mp4")}.jpg`);
  await runFfmpeg(["-y", "-hide_banner", "-loglevel", "error", "-ss", String(Math.min(duration / 2, 1)), "-i", out, "-frames:v", "1", "-vf", "scale=640:640:force_original_aspect_ratio=decrease", thumbnailPath], { signal, timeout: 60000 });
  const checks: DirectorCheck[] = [
    { id: "resolution", label: "Export dimensions", status: "pass", detail: `${width} × ${height}, H.264 MP4, 30 fps` },
    { id: "duration", label: "Duration", status: "pass", detail: `${verified.duration.toFixed(2)} seconds; matches the saved edit` },
    { id: "audio", label: "Audio assembly", status: "pass", detail: music ? `Selected ${p.settings.soundtrackLoop === false ? "non-looping audio" : "looping soundtrack"} mixed with available scene audio; ${duration >= 3 ? "loudness normalization" : "peak limiting"} applied. Listen before delivery.` : sourceAudioPresent ? `Available source audio preserved; ${duration >= 3 ? "loudness normalization" : "peak limiting"} applied.` : "No source audio or soundtrack was included; the export is silent." },
    { id: "typography", label: "Typography", status: "pending", detail: "Text uses bundled fonts and ASS shaping. Review Arabic joins, mixed direction, line breaks and safe areas in the export." },
    { id: "editorial", label: "Creative and factual review", status: "pending", detail: "Review pacing, source selection, claims, cultural context and brand accuracy before client delivery." },
  ];
  if (p.scenes.some((s) => s.voiceover.trim())) checks.push({ id: "voiceover", label: "Voiceover direction", status: "warning", detail: "Written voiceover direction is not synthesized by this renderer. Upload a recorded or generated track to include narration." });
  return { filePath: out, thumbnailPath, width, height, duration: verified.duration, checks };
}
