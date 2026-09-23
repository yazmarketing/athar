/** Lightweight timing guidance, not a guarantee of the model's pacing. */
export function suggestVideoDuration(prompt: string, maxDuration: number, montage = false) {
  const text = prompt.trim();
  const explicit = text.match(/\b(\d+(?:\.\d+)?)\s*(?:-\s*)?(?:seconds?|secs?|s)\b/i);
  const dialogue = [...text.matchAll(/(?:says?|speaks?|dialogue|voiceover|narrat(?:es|ion)|يقول|تقول)\s*[:：]?\s*["“«]([^"”»]+)["”»]/giu)]
    .map(match => match[1]).join(" ");
  const words = dialogue.split(/\s+/u).filter(Boolean).length;
  const beats = (text.match(/\b(?:then|afterwards|next|followed by)\b|ثم/giu) ?? []).length;
  const multipleShots = montage || /\b(?:montage|multiple scenes|multiple shots|scene\s*2|shot\s*2|cut to)\b/i.test(text);
  let seconds = 5;
  let reason = "Suggested for a single shot. Adjust to suit your pacing.";
  if (multipleShots) { seconds = 10; reason = "Several shots: consider generating them separately."; }
  else if (beats) { seconds = Math.min(10, 5 + beats * 2); reason = "Extra time for the sequence of actions."; }
  if (words) { seconds = Math.max(seconds, Math.ceil(words / 2.3 + 1)); reason = "Estimated from the spoken words, with room for a pause."; }
  if (explicit) { seconds = Math.ceil(Number(explicit[1])); reason = "Uses the duration written in your prompt."; }
  const limited = seconds > maxDuration;
  return {
    seconds: Math.max(4, Math.min(maxDuration, seconds)),
    reason: limited ? `This model supports up to ${maxDuration}s. Shorten the dialogue or split the scene.` : reason,
  };
}
