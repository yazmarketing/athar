"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { Check, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import type { MotionProject } from "@/lib/motion/schema";
import styles from "./motion-progress.module.css";

/** An indeterminate activity visualization, never a simulated render or completion percentage. */
export function MotionProgress({ project }: { project: MotionProject }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const designing = project.status === "designing";
  const studying = (!designing && project.commandKind === "inspect") || (designing && project.designJob?.phase === "study");
  const job = project.designJob;
  const reviewing = job?.purpose === "review";
  const recovering = designing && !!job?.recoveryAttempt;
  const queued = designing && job?.providerStatus === "queued";
  const reconnecting = designing && job?.notice?.startsWith("Reconnecting");
  const start = designing ? job?.startedAt : project.commandAt;
  const seconds = now && start ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const title = studying ? "Learning your visual language." : reviewing ? "A closer look at your craft." : reconnecting ? "Keeping your idea in motion." : recovering ? "Making room for your vision." : queued ? "Your idea is in the queue." : designing ? "Your idea. Taking shape." : project.status === "encoding" ? "The final finishing touch." : project.status === "queued" ? "Your scene is ready to build." : project.commandKind === "render" ? "Bringing every frame to life." : "Building your world in layers.";
  const activity = studying ? "After Effects is capturing your source" : reviewing ? "Astra is reviewing the native frames" : reconnecting ? "Reconnecting to Astra" : recovering ? "Astra · expanded design attempt" : queued ? "Queued with Astra" : designing ? "Astra is designing your motion" : project.status === "encoding" ? "Preparing your playable video" : project.status === "queued" ? "Waiting for After Effects" : project.commandKind === "render" ? "After Effects is rendering" : "After Effects is building";
  const description = studying ? "Studying the original artwork and motion, mapping native elements to your brief, and forming a treatment before building. Your source stays unchanged." : reviewing ? "Checking the actual rendered frames against your direction, with specific notes for the next revision. Movement and audio still need playback review." : designing ? "Turning your direction into an editable composition, with its own rhythm, layers and movement." : project.status === "encoding" ? "Your native render is complete. Preparing the version you can play and share." : "Your composition is being built and rendered locally. Keep After Effects and its bridge open.";
  const settings = designing ? job?.settings ?? project.scene : project.scene;
  const steps = studying ? ["Source selected", "Capturing art direction", "Ready for Astra"] : reviewing ? ["Frames rendered", "Reviewing with Astra", "Notes for your revision"] : designing ? ["Direction saved", "Designing with Astra", "Ready to build"] : ["Design ready", project.status === "encoding" ? "Preparing video" : "After Effects", "Ready to review"];
  return <section className={styles.progress} aria-label="Motion creation progress">
    <div className={styles.top}><span className={styles.live}><i/> CREATION IN PROGRESS</span><span className={styles.elapsed} aria-label={`Elapsed time ${elapsed}`}><Clock3 size={13}/>{elapsed}</span></div>
    <div className={styles.art} aria-hidden="true">
      <div className={styles.orbit}/><div className={styles.orbitTwo}/><div className={styles.frame}/>
      <div className={styles.tiles}>{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties}/>)}</div>
      <span className={styles.mark}>أثر</span><span className={styles.crossOne}>+</span><span className={styles.crossTwo}>+</span>
      <span className={styles.artCaption}>IDEAS → MOTION</span>
    </div>
    <div className={styles.copy}><div className={styles.activity} role="status"><Sparkles size={15}/>{activity}</div><h2>{title}</h2><p>{job?.notice && designing ? job.notice : description}</p></div>
    <div className={styles.flow} aria-label="Workflow stages">{steps.map((step, i) => <div key={step} aria-current={i === 1 ? "step" : undefined} data-state={i === 0 ? "done" : i === 1 ? "active" : "next"}><span>{i === 0 ? <Check size={12}/> : i === 1 ? <i/> : "03"}</span><b>{step}</b></div>)}</div>
    <div className={styles.bottom}><span><ShieldCheck size={15}/>{project.scene ? "Previous design safely saved" : "Your direction is saved"}</span>{settings && <span>{settings.width} × {settings.height} <i>·</i> {settings.duration}s</span>}</div>
    {designing && <p className={styles.leave}>You can explore Athar while this runs. Come back here for your design.</p>}
  </section>;
}
