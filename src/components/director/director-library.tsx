"use client";

import { useEffect, useState } from "react";
import { AudioLines, Loader2, Search, X } from "lucide-react";
import type { GenerationRecord, TtsGenerationRecord } from "@/lib/types";
import styles from "./director-workspace.module.css";

type Item = { id: string; name: string; url: string; kind: string; status: string };
export function DirectorLibrary({ disabled, onClose, onImport }: {
  disabled: boolean;
  onClose: () => void;
  onImport: (source: "generation" | "voice", id: string) => Promise<void>;
}) {
  const [source, setSource] = useState<"generation" | "voice">("generation");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ source: string; items: Item[]; error: string } | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    fetch(source === "voice" ? "/api/tts?limit=80" : "/api/generations", { signal: abort.signal }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the library.");
      const records = data.generations as (GenerationRecord | TtsGenerationRecord)[];
      return records.filter((g) => g.output_url && ["ready", "qc_flagged"].includes(g.status)).map((g) => ({
        id: g.id, name: "title" in g ? g.title : g.final_prompt, url: g.output_url!, status: g.status,
        kind: "title" in g ? "voice" : g.mode === "t2i" ? "image" : "video",
      }));
    }).then((items) => { if (!abort.signal.aborted) setResult({ source, items, error: "" }); })
      .catch((error: unknown) => { if (!abort.signal.aborted) setResult({ source, items: [], error: error instanceof Error ? error.message : "Could not load the library." }); });
    return () => abort.abort();
  }, [source, reload]);
  const loading = !result || result.source !== source;
  const items = result?.items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())) || [];
  return <div className={styles.libraryPanel}>
    <div className={styles.panelHeading}><h3>From your Athar library</h3><button className={styles.iconButton} onClick={onClose} aria-label="Close library"><X size={16} /></button></div>
    <p className={styles.panelDescription}>Bring generated images, videos, and directed voice tracks into this production.</p>
    <div className={styles.segmented}><button className={source === "generation" ? styles.segmentActive : ""} onClick={() => setSource("generation")}>Images & video</button><button className={source === "voice" ? styles.segmentActive : ""} onClick={() => setSource("voice")}>Voice tracks</button></div>
    <div className={styles.librarySearch}><Search size={14} /><input aria-label="Search Athar library" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a creation…" /></div>
    {loading ? <p className={styles.emptyNote}><Loader2 size={16} className="animate-spin" />Loading creations…</p> : result.error ? <div className={styles.productionError}><p>{result.error}</p><button onClick={() => { setResult(null); setReload((n) => n + 1); }}>Try again</button></div> : !items.length ? <p className={styles.emptyNote}>No matching completed creations. Create an image, video, or voice track in Athar, then import it here.</p> : <div className={styles.libraryGrid}>{items.map((item) => <button key={item.id} className={styles.libraryItem} disabled={disabled} onClick={() => void onImport(source, item.id)}>
      <div>{item.kind === "image" ?
        // Existing library URLs are displayed directly, as in Athar's gallery.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt="" loading="lazy" /> : item.kind === "voice" ? <AudioLines size={25} /> : <video src={item.url} muted preload="metadata" playsInline />}</div>
      <strong title={item.name}>{item.name || "Untitled creation"}</strong><small>{item.kind}{item.status === "qc_flagged" ? " · review flagged" : " · import"}</small>
    </button>)}</div>}
  </div>;
}
