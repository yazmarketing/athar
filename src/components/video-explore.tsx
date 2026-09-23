"use client";

import { useState, type CSSProperties } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import { filterVideoRecipes, type VideoRecipe } from "@/config/video-recipes";
import styles from "./video-explore.module.css";

function RecipePreview({ recipe }: { recipe: VideoRecipe }) {
  const fallbackStyle = { "--preview-color": recipe.color } as CSSProperties;
  if (!recipe.preview) {
    return <div className={styles.previewFallback} style={fallbackStyle} aria-hidden="true"><span>{recipe.category}</span><strong>{recipe.title}</strong></div>;
  }
  return <div className={styles.preview} style={fallbackStyle} data-motion={recipe.preview.motion} aria-hidden="true">
    {recipe.preview.src
      ? <video autoPlay loop muted playsInline preload="metadata" poster={recipe.preview.poster}><source src={recipe.preview.src} type="video/mp4" /></video>
      : <div className={styles.still} style={{ backgroundImage: `url(${recipe.preview.poster})` }} />}
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
      <div className={styles.picture}><RecipePreview recipe={recipe} /><span className={styles.use}>Use preset <ArrowUpRight size={15} /></span></div>
      <div className={styles.caption}><span>{recipe.category}</span><h3>{recipe.title}</h3><p>{recipe.description}</p></div>
    </button>)}</div>
    {recipes.length === 0 && <div className={styles.empty}><p>No presets match your search.</p><button type="button" onClick={() => { setQuery(""); setCategory("All"); }}>Show all presets</button></div>}
    <p className={styles.note}>Preview motion illustrates the direction. Generated results vary by model, prompt, and reference.</p>
  </section>;
}
