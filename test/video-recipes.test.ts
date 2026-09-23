import { expect, it } from "vitest";
import { VIDEO_RECIPES } from "@/config/video-recipes";
import { CAMERA_PRESETS } from "@/config/camera";
import { STYLE_PRESETS } from "@/config/styles";
import { GENRE_PRESETS, SHOT_PRESETS } from "@/config/director";
import { buildPrompt } from "@/lib/prompt";
import { listVideoModelOptions, resolveModel } from "@/config/models";

it("offers one choice per video engine while keeping saved hero jobs resolvable", () => {
  const options = listVideoModelOptions();
  expect(options.map((item) => item.tier)).toEqual(["draft", "standard"]);
  expect(options.find((item) => item.slug === resolveModel("t2v", "hero").slug)?.label).toBe("Seedance 2.5");
});

it.each(VIDEO_RECIPES)("$title reaches the generation prompt with its motion and look intact", ({ prompt }) => {
  const camera = CAMERA_PRESETS.find((item) => item.id === prompt.cameraId);
  const style = STYLE_PRESETS.find((item) => item.id === prompt.styleId);
  expect(camera).toBeDefined();
  expect(style).toBeDefined();
  const { finalPrompt } = buildPrompt(prompt);
  expect(finalPrompt).toContain(prompt.subject);
  expect(finalPrompt).toContain(prompt.action);
  expect(finalPrompt).toContain(camera!.fragment);
  expect(finalPrompt).toContain(style!.positive);
  if (prompt.genreId) expect(finalPrompt).toContain(GENRE_PRESETS.find((item) => item.id === prompt.genreId)!.fragment);
  if (prompt.shotId) expect(finalPrompt).toContain(SHOT_PRESETS.find((item) => item.id === prompt.shotId)!.fragment);
});
