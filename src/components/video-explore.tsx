"use client";

import { useState, type CSSProperties } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import { filterVideoRecipes, type VideoRecipe } from "@/config/video-recipes";
import styles from "./video-explore.module.css";

export function MotionArtwork({ art, color }: Pick<VideoRecipe, "art" | "color">) {
  return <div className={`${styles.art} ${styles[art]}`} style={{ "--art-color": color } as CSSProperties} aria-hidden="true">
    <div className={styles.grid} /><i className={styles.object} /><i className={styles.path} /><i className={styles.light} />
    <span className={styles.crosshair}>+</span><span className={styles.artLabel}>MOTION STUDY</span>
  </div>;
}

export function VideoExplore({ onSelect, compact = false }: { onSelect: (recipe: VideoRecipe) => void; compact?: boolean }) {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const recipes = filterVideoRecipes(query, category);
  return <section className={styles.explore} aria-label="Video presets">
    <div className={styles.heading}><div><span className={styles.eyebrow}>FIND YOUR NEXT SHOT</span><h2>Looks & motion</h2><p>Choose a starting point. Make the prompt your own.</p></div>
      <label className={styles.search}><Search size={15} /><input aria-label="Search video presets" placeholder="Find a look or camera move" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear preset search"><X size={14} /></button>}</label>
    </div>
    <div className={styles.filters} aria-label="Preset categories">{["All", "Camera", "Product", "Visual effects", "Editorial"].map((item) => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
    <div className={`${styles.cards} ${compact ? styles.compact : ""}`}>{recipes.map((recipe) => <button type="button" className={styles.card} key={recipe.id} onClick={() => onSelect(recipe)} aria-label={`Use ${recipe.title} preset`}>
      <div className={styles.picture}><MotionArtwork art={recipe.art} color={recipe.color} /><span className={styles.use}>Use preset <ArrowUpRight size={15} /></span></div>
      <div className={styles.caption}><span>{recipe.category}</span><h3>{recipe.title}</h3><p>{recipe.description}</p></div>
    </button>)}</div>
    {recipes.length === 0 && <div className={styles.empty}><p>No presets match your search.</p><button type="button" onClick={() => { setQuery(""); setCategory("All"); }}>Show all presets</button></div>}
    <p className={styles.note}>Original motion studies illustrate each direction. Presets guide generation through your prompt; results vary by model and reference.</p>
  </section>;
}
