"use client";

import type { ReactNode, RefObject } from "react";
import { ArrowRight, ArrowUpRight, Clapperboard, Film, ImageIcon, Mic, Search, X } from "lucide-react";
import { listVideoModelOptions, type Tier } from "@/config/models";
import type { VideoRecipe } from "@/config/video-recipes";
import { MotionArtwork, VideoExplore } from "./video-explore";
import styles from "./studio-home.module.css";

export type StudioHomeDestination = "storyboard" | "t2i" | "t2v" | "tts" | "transcribe" | "library" | "assets";
type StudioHomeProps = {
  firstName: string;
  clientName?: string;
  projectName?: string;
  searchRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (query: string) => void;
  onOpen: (destination: StudioHomeDestination) => void;
  onRecipe: (recipe: VideoRecipe) => void;
  onVideoModel: (tier: Tier) => void;
  onClearProject: () => void;
  recentContent: ReactNode;
  progressContent?: ReactNode;
};

export function StudioHome({ firstName, clientName, projectName, searchRef, query, onQueryChange, onOpen, onRecipe, onVideoModel, onClearProject, recentContent, progressContent }: StudioHomeProps) {
  return <div className={styles.scroll}><div className={styles.page}>
    <header className={styles.header}><div><h1>Explore</h1><p>{firstName ? `${firstName}, find your next direction.` : "Find your next direction."}{clientName ? ` · ${clientName}` : ""}</p></div><button type="button" onClick={() => onOpen("library")}>Your creations <ArrowUpRight size={16} /></button></header>
    <section className={styles.hero} aria-label="Create with Athar">
      <div className={styles.heroCopy}><span className={styles.tag}>ATHAR / VIDEO STUDIO</span><h2>Make something<br /><em>worth watching.</em></h2><p>From the first frame to the final take.<br />Generate video with your references, your look, your control.</p><button type="button" onClick={() => onOpen("t2v")}>Create a video <ArrowRight size={17} /></button></div>
      <div className={styles.heroArt}><MotionArtwork art="ribbon" color="#c9dda6" /><span className={styles.frameLabel}>01 / AN IDEA IN MOTION</span></div>
    </section>
    <div className={styles.shortcuts} aria-label="Creative tools">{[
      { id: "t2v", title: "Video", detail: "Text, image & video references", icon: Clapperboard },
      { id: "t2i", title: "Image", detail: "Generate, edit & refine", icon: ImageIcon },
      { id: "storyboard", title: "Storyboard", detail: "Build a sequence of shots", icon: Film },
      { id: "tts", title: "Voice", detail: "Language, delivery & expression", icon: Mic },
    ].map(({ id, title, detail, icon: Icon }) => <button type="button" key={id} onClick={() => onOpen(id as StudioHomeDestination)}><Icon size={19} /><span><strong>{title}</strong><small>{detail}</small></span><ArrowUpRight size={15} /></button>)}</div>
    {progressContent}
    <VideoExplore onSelect={onRecipe} />
    <section className={styles.models} aria-label="Video models"><div className={styles.sectionHeading}><div><h2>Choose your engine</h2><p>Video models configured in Athar. Choose a model, then shape your shot.</p></div></div><div className={styles.modelGrid}>{listVideoModelOptions().map((model, index) => <button type="button" key={model.tier} onClick={() => onVideoModel(model.tier)}><span className={styles.modelNumber}>0{index + 1}</span><div><h3>{model.label}</h3><p>{model.tier === "draft" ? "Explore ideas and iterate" : "Your everyday video workspace"}</p></div><ArrowUpRight size={17} /></button>)}</div></section>
    <section className={styles.recent} aria-label="Recent creations"><div className={styles.sectionHeading}><div><h2>{query.trim() ? "Search results" : "Your creations"}</h2><p>Revisit a take. Reuse a reference. Keep creating.</p></div><div className={styles.recentTools}>{projectName && <button type="button" className={styles.project} onClick={onClearProject} aria-label={`Showing ${projectName}. Show all projects`}>{projectName}<X size={13} /></button>}<label className={styles.search}><Search size={14} /><input ref={searchRef} value={query} onChange={(e) => onQueryChange(e.target.value)} aria-label="Search recent images and videos" placeholder="Search your creations" />{query && <button type="button" onClick={() => onQueryChange("")} aria-label="Clear search"><X size={13} /></button>}</label></div></div>{recentContent}</section>
  </div></div>;
}
