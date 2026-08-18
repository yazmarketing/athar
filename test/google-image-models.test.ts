import { describe, expect, it } from "vitest";
import {
  asGoogleImageModel,
  friendlyModelName,
  maxReferenceImages,
  GOOGLE_IMAGE_MODELS,
  MAX_REFERENCE_IMAGES,
} from "@/config/models";

describe("asGoogleImageModel", () => {
  it("accepts only the two Google ids", () => {
    expect(asGoogleImageModel("nano-banana")).toBe("nano-banana");
    expect(asGoogleImageModel("nano-banana-pro")).toBe("nano-banana-pro");
  });

  it("treats anything else as a Seedream request", () => {
    expect(asGoogleImageModel("seedream")).toBeNull();
    expect(asGoogleImageModel("hero")).toBeNull();
    // The picker's short id must not reach the API unmapped.
    expect(asGoogleImageModel("nano-pro")).toBeNull();
    expect(asGoogleImageModel(null)).toBeNull();
    expect(asGoogleImageModel(undefined)).toBeNull();
  });
});

describe("maxReferenceImages", () => {
  it("lets Pro carry more references than Seedream fuses", () => {
    expect(maxReferenceImages("nano-banana-pro")).toBe(14);
    expect(maxReferenceImages("nano-banana")).toBe(MAX_REFERENCE_IMAGES);
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
    expect(GOOGLE_IMAGE_MODELS["nano-banana-pro"].defaultSlug).toBe(
      "gemini-3-pro-image-preview"
    );
  });

  it("prices Pro above Nano Banana, and 4K above 2K", () => {
    const nano = GOOGLE_IMAGE_MODELS["nano-banana"];
    const pro = GOOGLE_IMAGE_MODELS["nano-banana-pro"];
    expect(pro.costPerImage).toBeGreaterThan(nano.costPerImage);
    expect(pro.costPerImage4K).toBeGreaterThan(pro.costPerImage);
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
  });
});
