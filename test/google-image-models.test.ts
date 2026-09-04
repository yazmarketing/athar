import { describe, expect, it } from "vitest";
import {
  asGoogleImageModel,
  friendlyModelName,
  googleAllows4K,
  googleImageCost,
  maxReferenceImages,
  GOOGLE_IMAGE_MODELS,
  MAX_REFERENCE_IMAGES,
} from "@/config/models";

describe("asGoogleImageModel", () => {
  it("accepts the Google ids the API actually routes", () => {
    expect(asGoogleImageModel("nano-banana")).toBe("nano-banana");
    expect(asGoogleImageModel("nano-banana-2")).toBe("nano-banana-2");
    expect(asGoogleImageModel("nano-banana-pro")).toBe("nano-banana-pro");
  });

  it("treats anything else as a Seedream request", () => {
    expect(asGoogleImageModel("gpt-image-2")).toBeNull();
    expect(asGoogleImageModel("seedream")).toBeNull();
    expect(asGoogleImageModel("hero")).toBeNull();
    // The picker's short id must not reach the API unmapped.
    expect(asGoogleImageModel("nano-pro")).toBeNull();
    expect(asGoogleImageModel("nano-2")).toBeNull();
    expect(asGoogleImageModel(null)).toBeNull();
    expect(asGoogleImageModel(undefined)).toBeNull();
  });
});

describe("maxReferenceImages", () => {
  it("lets Nano Banana 2 and Pro carry more references than Seedream fuses", () => {
    expect(maxReferenceImages("nano-banana-pro")).toBe(14);
    expect(maxReferenceImages("nano-banana-2")).toBe(14);
    expect(maxReferenceImages("nano-banana")).toBe(MAX_REFERENCE_IMAGES);
    expect(maxReferenceImages("gpt-image-2")).toBe(16);
    expect(maxReferenceImages("seedream")).toBe(MAX_REFERENCE_IMAGES);
    expect(maxReferenceImages(null)).toBe(MAX_REFERENCE_IMAGES);
  });

  it("never returns a cap below the dock's floor", () => {
    for (const id of Object.keys(GOOGLE_IMAGE_MODELS)) {
      expect(maxReferenceImages(id)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("Google model registry", () => {
  it("pins the published API ids", () => {
    expect(GOOGLE_IMAGE_MODELS["nano-banana"].defaultSlug).toBe(
      "gemini-2.5-flash-image"
    );
    expect(GOOGLE_IMAGE_MODELS["nano-banana-2"].defaultSlug).toBe(
      "gemini-3.1-flash-image"
    );
    expect(GOOGLE_IMAGE_MODELS["nano-banana-pro"].defaultSlug).toBe(
      "gemini-3-pro-image-preview"
    );
  });

  it("prices the ladder Nano Banana < 2 < Pro, and 4K above 2K", () => {
    const nano = GOOGLE_IMAGE_MODELS["nano-banana"];
    const pro = GOOGLE_IMAGE_MODELS["nano-banana-pro"];
    expect(googleImageCost("nano-banana-2", "1K")).toBeGreaterThan(
      nano.costPerImage
    );
    expect(googleImageCost("nano-banana-pro", "2K")).toBeGreaterThan(
      googleImageCost("nano-banana-2", "2K")
    );
    expect(googleImageCost("nano-banana-2", "2K")).toBeGreaterThan(
      googleImageCost("nano-banana-2", "1K")
    );
    expect(googleImageCost("nano-banana-2", "4K")).toBeGreaterThan(
      googleImageCost("nano-banana-2", "2K")
    );
    expect(pro.costPerImage4K).toBeGreaterThan(pro.costPerImage);
    expect(googleAllows4K("nano-banana")).toBe(false);
    expect(googleAllows4K("nano-banana-2")).toBe(true);
    expect(googleAllows4K("nano-banana-pro")).toBe(true);
  });

  it("names every Google slug the studio can store", () => {
    expect(friendlyModelName("google:gemini-3-pro-image-preview")).toBe(
      "Nano Banana Pro"
    );
    // GA id, for when Google drops the -preview suffix.
    expect(friendlyModelName("google:gemini-3-pro-image")).toBe(
      "Nano Banana Pro"
    );
    expect(friendlyModelName("google:gemini-2.5-flash-image")).toBe(
      "Nano Banana"
    );
    expect(friendlyModelName("google:gemini-3.1-flash-image")).toBe(
      "Nano Banana 2"
    );
    expect(friendlyModelName("google:gemini-3.1-flash-image-preview")).toBe(
      "Nano Banana 2"
    );
    expect(friendlyModelName("openai:gpt-image-2")).toBe("GPT Image 2");
  });
});
