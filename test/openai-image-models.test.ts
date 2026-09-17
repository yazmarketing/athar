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
  it("accepts the OpenAI ids the API actually routes", () => {
    expect(asOpenAIImageModel("gpt-image-2")).toBe("gpt-image-2");
    expect(asOpenAIImageModel("gpt-image-2.5-flare")).toBe("gpt-image-2.5-flare");
    expect(asOpenAIImageModel("gpt-image-2.5-sunburst")).toBe(
      "gpt-image-2.5-sunburst"
    );
  });

  it("rejects picker ids and other providers", () => {
    expect(asOpenAIImageModel("gpt-2")).toBeNull();
    expect(asOpenAIImageModel("nano-banana")).toBeNull();
    expect(asOpenAIImageModel("hero")).toBeNull();
    expect(asOpenAIImageModel(null)).toBeNull();
  });
});

describe("OpenAI model registry", () => {
  it("pins the published API ids", () => {
    expect(OPENAI_IMAGE_MODELS["gpt-image-2"].defaultSlug).toBe("gpt-image-2");
    expect(OPENAI_IMAGE_MODELS["gpt-image-2.5-flare"].defaultSlug).toBe(
      "gpt-image-2.5-flare"
    );
    expect(OPENAI_IMAGE_MODELS["gpt-image-2.5-sunburst"].defaultSlug).toBe(
      "gpt-image-2.5-sunburst"
    );
  });

  it("prices 4K above 2K above 1K on every GPT Image model", () => {
    for (const id of Object.keys(OPENAI_IMAGE_MODELS) as Array<
      keyof typeof OPENAI_IMAGE_MODELS
    >) {
      expect(openaiImageCost(id, "2K")).toBeGreaterThan(
        openaiImageCost(id, "1K")
      );
      expect(openaiImageCost(id, "4K")).toBeGreaterThan(
        openaiImageCost(id, "2K")
      );
      expect(openaiAllows4K(id)).toBe(true);
      expect(imageAllows4K(id)).toBe(true);
    }
    expect(imageAllows4K("nano-banana")).toBe(false);
  });

  it("names the stored endpoints", () => {
    expect(friendlyModelName("openai:gpt-image-2")).toBe("GPT Image 2");
    expect(friendlyModelName("openai:gpt-image-2.5-flare")).toBe(
      "GPT Image 2.5 Flare"
    );
    expect(friendlyModelName("openai:gpt-image-2.5-sunburst")).toBe(
      "GPT Image 2.5 Sunburst"
    );
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
