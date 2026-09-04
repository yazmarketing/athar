import { describe, expect, it } from "vitest";
import {
  asOpenAIImageModel,
  friendlyModelName,
  imageAllows4K,
  openaiAllows4K,
  openaiImageCost,
  OPENAI_IMAGE_MODELS,
} from "@/config/models";
import { ASPECT_RATIOS, openaiSizeFor } from "@/config/aspects";

describe("asOpenAIImageModel", () => {
  it("accepts the OpenAI id the API actually routes", () => {
    expect(asOpenAIImageModel("gpt-image-2")).toBe("gpt-image-2");
  });

  it("rejects picker ids and other providers", () => {
    expect(asOpenAIImageModel("gpt-2")).toBeNull();
    expect(asOpenAIImageModel("nano-banana")).toBeNull();
    expect(asOpenAIImageModel("hero")).toBeNull();
    expect(asOpenAIImageModel(null)).toBeNull();
  });
});

describe("OpenAI model registry", () => {
  it("pins the published API id", () => {
    expect(OPENAI_IMAGE_MODELS["gpt-image-2"].defaultSlug).toBe("gpt-image-2");
  });

  it("prices 4K above 2K above 1K", () => {
    expect(openaiImageCost("gpt-image-2", "2K")).toBeGreaterThan(
      openaiImageCost("gpt-image-2", "1K")
    );
    expect(openaiImageCost("gpt-image-2", "4K")).toBeGreaterThan(
      openaiImageCost("gpt-image-2", "2K")
    );
    expect(openaiAllows4K("gpt-image-2")).toBe(true);
    expect(imageAllows4K("gpt-image-2")).toBe(true);
    expect(imageAllows4K("nano-banana")).toBe(false);
  });

  it("names the stored endpoint", () => {
    expect(friendlyModelName("openai:gpt-image-2")).toBe("GPT Image 2");
  });
});

describe("openaiSizeFor", () => {
  it("keeps every dimension a multiple of 16", () => {
    for (const ratio of ASPECT_RATIOS) {
      for (const resolution of ["1K", "2K", "4K"] as const) {
        const [w, h] = openaiSizeFor(ratio, resolution).split("x").map(Number);
        expect(w % 16).toBe(0);
        expect(h % 16).toBe(0);
      }
    }
  });

  it("stays inside OpenAI's 3840×2160 envelope at 4K", () => {
    for (const ratio of ASPECT_RATIOS) {
      const [w, h] = openaiSizeFor(ratio, "4K").split("x").map(Number);
      expect(Math.max(w, h)).toBeLessThanOrEqual(3840);
      expect(Math.min(w, h)).toBeLessThanOrEqual(2160);
    }
  });

  it("uses 3840×2160 for 16:9 4K", () => {
    expect(openaiSizeFor("16:9", "4K")).toBe("3840x2160");
    expect(openaiSizeFor("9:16", "4K")).toBe("2160x3840");
  });
});
