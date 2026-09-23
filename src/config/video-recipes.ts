import type { PromptInputs } from "@/lib/types";

export type VideoRecipe = {
  id: string;
  title: string;
  category: "Camera" | "Product" | "Visual effects" | "Editorial";
  description: string;
  color: string;
  preview?: {
    src: string;
    poster: string;
  };
  prompt: PromptInputs;
};

// Creative starting points for the existing video generator. These are prompt
// recipes, not proprietary effect models or promises of deterministic edits.
export const VIDEO_RECIPES: VideoRecipe[] = [
  { id: "hero-orbit", title: "Hero orbit", category: "Camera", color: "#c8dcb5", preview: { src: "/explore/hero-orbit.mp4", poster: "/explore/hero-orbit.webp" }, description: "A smooth arc. Every angle earns its frame.", prompt: { subject: "A sculptural perfume bottle on a stone plinth in a minimal studio", action: "A continuous camera orbit reveals the bottle's silhouette and reflections. The product stays perfectly still and its shape remains consistent.", cameraId: "orbit", styleId: "studio_product", genreId: "commercial" } },
  { id: "snap-in", title: "Snap in", category: "Camera", color: "#ddaa78", preview: { src: "/explore/snap-in.mp4", poster: "/explore/snap-in.webp" }, description: "A punchy zoom straight into the detail.", prompt: { subject: "A fashion portrait against a warm terracotta backdrop", action: "Start wide, then snap into a close-up of the subject's eyes. Hold a clear final frame.", cameraId: "crash_zoom", styleId: "editorial" } },
  { id: "reveal", title: "The reveal", category: "Camera", color: "#9cccd2", preview: { src: "/explore/reveal.mp4", poster: "/explore/reveal.webp" }, description: "Open the frame. Give the scene its scale.", prompt: { subject: "A contemporary pavilion set among desert dunes at sunrise", action: "Begin close to the pavilion and rise smoothly to reveal the surrounding landscape.", cameraId: "crane_up", styleId: "cinematic", genreId: "epic" } },
  { id: "glass-study", title: "Glass study", category: "Product", color: "#b4abdc", description: "Refraction, soft light, a sculptural finish.", prompt: { subject: "A clear glass fragrance bottle with a brushed metal cap on a reflective surface", action: "Light travels slowly across the glass, revealing refraction and fine material detail. Preserve the bottle geometry throughout.", cameraId: "push_in", styleId: "studio_product", genreId: "commercial" } },
  { id: "weightless", title: "Weightless", category: "Product", color: "#e0bcbc", description: "A suspended product with a gentle turn.", prompt: { subject: "A single premium sneaker suspended above a seamless studio floor", action: "The sneaker levitates and slowly rotates with a soft moving shadow below. Maintain its materials and proportions.", cameraId: "locked", styleId: "render_3d", genreId: "commercial" } },
  { id: "light-trail", title: "Light trail", category: "Visual effects", color: "#b8d481", description: "Luminous ribbons trace the subject.", prompt: { subject: "A dancer standing in a dark spacious studio", action: "As the dancer makes one fluid movement, a luminous ribbon traces the path of their hands, then fades. Keep the face and anatomy natural.", cameraId: "tracking", styleId: "cinematic" } },
  { id: "particle-reveal", title: "Particle reveal", category: "Visual effects", color: "#dbbd81", description: "A form takes shape from drifting particles.", prompt: { subject: "A sculptural metallic sphere suspended in a dark studio", action: "Fine metallic particles gather gradually into a solid sphere. End on a clean, stable hero frame with the particles settled.", cameraId: "push_in", styleId: "render_3d" } },
  { id: "motion-echo", title: "Motion echo", category: "Visual effects", color: "#9bb4df", description: "Layered silhouettes follow one movement.", prompt: { subject: "An athlete making a single controlled leap against a clean blue backdrop", action: "Faint translucent motion echoes trail the athlete's movement, then resolve into one sharp silhouette on landing.", cameraId: "locked", styleId: "editorial" } },
  { id: "street-editorial", title: "Street editorial", category: "Editorial", color: "#c5b9a5", description: "Natural movement. An observational eye.", prompt: { subject: "A fashion subject walking through a shaded contemporary courtyard", action: "Follow at a relaxed pace with natural fabric movement, candid expression, and subtle ambient activity.", cameraId: "handheld", styleId: "editorial", genreId: "documentary" } },
  { id: "macro-world", title: "Macro world", category: "Product", color: "#a9c0ab", description: "Make texture the main event.", prompt: { subject: "Extreme detail of a finely crafted mechanical watch", action: "Move slowly over brushed metal, engraved markers and the moving mechanism. Keep the material detail crisp and consistent.", cameraId: "tracking", styleId: "studio_product", shotId: "close_up" } },
  { id: "fly-through", title: "Fly through", category: "Camera", color: "#a5c9ce", description: "Travel through a space in one continuous take.", prompt: { subject: "A contemporary gallery with curved walls and sculptural installations", action: "Fly smoothly through the gallery in one continuous take, passing between installations without intersecting objects.", cameraId: "fpv", styleId: "cinematic" } },
  { id: "quiet-luxury", title: "Quiet luxury", category: "Editorial", color: "#d1c7b2", description: "A held frame, texture and warm afternoon light.", prompt: { subject: "A handwoven textile draped across a sculptural chair beside a tall window", action: "A soft breeze gently moves the edge of the fabric. Hold the composition and let the changing light reveal the texture.", cameraId: "locked", styleId: "editorial", genreId: "commercial" } },
];

export function filterVideoRecipes(query: string, category: string = "All") {
  const term = query.trim().toLowerCase();
  return VIDEO_RECIPES.filter((recipe) => (category === "All" || category === recipe.category) && `${recipe.title} ${recipe.description} ${recipe.category}`.toLowerCase().includes(term));
}
