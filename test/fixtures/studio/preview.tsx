// Isolated component preview: no session, account, API calls or paid jobs.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { StudioHome } from "../../../src/components/studio-home";
import { VideoExplore } from "../../../src/components/video-explore";
import type { VideoRecipe } from "../../../src/config/video-recipes";
import "../../../src/app/globals.css";

function Preview() {
  const [selection, setSelection] = useState("");
  const [view, setView] = useState("Explore");
  const choose = (recipe: VideoRecipe) => setSelection(`${recipe.title}: ${recipe.prompt.subject} — ${recipe.prompt.action} [${recipe.prompt.cameraId}]`);
  return <div style={{ display: "flex", height: "100dvh" }}>
    <aside className="hidden w-52 shrink-0 flex-col gap-2 border-r border-border bg-sidebar p-5 md:flex"><strong className="mb-7 text-2xl tracking-tight">athar</strong>{["Explore", "Video", "Looks & motion", "Image", "Storyboard", "Voice", "Library"].map((item) => <button key={item} onClick={() => { setView(item); setSelection(""); }} className="rounded-lg p-2 text-left text-sm hover:bg-muted">{item}</button>)}<small className="mt-auto text-muted-foreground">Component preview · sample data</small></aside>
    <main className="flex min-w-0 flex-1 flex-col">{selection && <div role="status" className="shrink-0 border-b border-border bg-card p-4 text-sm">{selection}<button className="ml-4 underline" onClick={() => setSelection("")}>Dismiss</button></div>}{view === "Explore" ? <StudioHome firstName="" onOpen={(destination) => setSelection(`Open ${destination}`)} onRecipe={choose} /> : <div className="overflow-y-auto p-6"><VideoExplore onSelect={choose} compact={view === "Video"} /></div>}</main>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
