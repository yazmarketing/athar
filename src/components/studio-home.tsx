"use client";

import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Clapperboard, Film, ImageIcon, Mic } from "lucide-react";
import type { VideoRecipe } from "@/config/video-recipes";
import { VideoExplore } from "./video-explore";
import styles from "./studio-home.module.css";

export type StudioHomeDestination = "storyboard" | "t2i" | "t2v" | "tts" | "transcribe" | "library" | "assets";
type StudioHomeProps = {
  firstName: string;
  clientName?: string;
  onOpen: (destination: StudioHomeDestination) => void;
  onRecipe: (recipe: VideoRecipe) => void;
  progressContent?: ReactNode;
};

export function StudioHome({ firstName, clientName, onOpen, onRecipe, progressContent }: StudioHomeProps) {
  return <div className={styles.scroll}><div className={styles.page}>
    <header className={styles.header}><div><h1>Explore</h1><p>{firstName ? `${firstName}, find your next direction.` : "Find your next direction."}{clientName ? ` · ${clientName}` : ""}</p></div></header>
    <section className={styles.hero} aria-label="Create with Athar">
      <div className={styles.heroCopy}><span className={styles.tag}>ATHAR / VIDEO STUDIO</span><h2>Make something<br /><em>worth watching.</em></h2><p>From the first frame to the final take.<br />Generate video with your references, your look, your control.</p><button type="button" onClick={() => onOpen("t2v")}>Create a video <ArrowRight size={17} /></button></div>
    </section>
    <div className={styles.shortcuts} aria-label="Creative tools">{[
      { id: "t2v", title: "Video", detail: "Text, image & video references", icon: Clapperboard },
      { id: "t2i", title: "Image", detail: "Generate, edit & refine", icon: ImageIcon },
      { id: "storyboard", title: "Storyboard", detail: "Build a sequence of shots", icon: Film },
      { id: "tts", title: "Voice", detail: "Language, delivery & expression", icon: Mic },
    ].map(({ id, title, detail, icon: Icon }) => <button type="button" key={id} onClick={() => onOpen(id as StudioHomeDestination)}><Icon size={19} /><span><strong>{title}</strong><small>{detail}</small></span><ArrowUpRight size={15} /></button>)}</div>
    {progressContent}
    <VideoExplore onSelect={onRecipe} />
  </div></div>;
}
