import { describe, expect, it } from "vitest";
import {
  IMAGE_MODEL_CHOICES,
  DEFAULT_IMAGE_MODEL_ID,
  imageModelChoice,
  imageModelCost,
  imageModelIdFrom,
  imageModelIdFromEndpoint,
  imageModelRequest,
  GOOGLE_IMAGE_MODELS,
} from "@/config/models";
import { IMAGE_MODELS } from "@/app/api/recommend-model/route";

describe("the image-model list", () => {
  it("has unique ids and a valid default", () => {
    const ids = IMAGE_MODEL_CHOICES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(imageModelChoice(DEFAULT_IMAGE_MODEL_ID)).not.toBeNull();
  });

  it("carries every model the studio can actually run", () => {
    const ids = IMAGE_MODEL_CHOICES.map((m) => m.id);
    expect(ids).toContain("draft");
    expect(ids).toContain("standard");
    expect(ids).toContain("hero");
    expect(ids).toContain("nano");
    expect(ids).toContain("nano-2");
    expect(ids).toContain("nano-pro");
  });

  it("gives every choice a usable request shape", () => {
    for (const choice of IMAGE_MODEL_CHOICES) {
      const req = imageModelRequest(choice.id);
      // Exactly one routing field — a tier (Seedream) or an imageModel
      // (Google). Both or neither would be ambiguous at the API.
      expect(Boolean(req.tier) !== Boolean(req.imageModel)).toBe(true);
      expect(choice.slug.length).toBeGreaterThan(0);
      expect(choice.maxReferenceImages).toBeGreaterThan(0);
      expect(choice.resolutions.length).toBeGreaterThan(0);
      expect(choice.bestFor.length).toBeGreaterThan(0);
    }
  });

  it("prices every choice", () => {
    for (const choice of IMAGE_MODEL_CHOICES) {
      const cost = imageModelCost(choice.id, choice.resolutions[0], 1);
      expect(cost).not.toBeNull();
      expect(cost).toBeGreaterThan(0);
    }
  });

  it("offers 4K only where the model supports it", () => {
    for (const choice of IMAGE_MODEL_CHOICES) {
      if (choice.resolutions.includes("4K")) {
        expect(choice.provider).toBe("google");
        expect(choice.imageModel).not.toBeNull();
        expect(
          GOOGLE_IMAGE_MODELS[choice.imageModel!].costPerImage4K
        ).toBeGreaterThan(0);
      }
    }
  });

  it("charges more for 4K than 2K on models that offer it", () => {
    for (const id of ["nano-2", "nano-pro"] as const) {
      const at2K = imageModelCost(id, "2K", 1);
      const at4K = imageModelCost(id, "4K", 1);
      expect(at4K).toBeGreaterThan(at2K as number);
    }
  });
});

describe("the routing guide", () => {
  it("recommends from exactly the list the pickers render", () => {
    expect(IMAGE_MODELS.map((m) => m.id)).toEqual(
      IMAGE_MODEL_CHOICES.map((m) => m.id)
    );
  });
});

describe("recovering the model from a stored generation", () => {
  it("reads a Seedream endpoint back to its tier", () => {
    expect(
      imageModelIdFromEndpoint("byteplus:seedream-5-0-260128", "standard")
    ).toBe("standard");
    expect(
      imageModelIdFromEndpoint("byteplus:dola-seedream-5-0-pro-260628", "hero")
    ).toBe("hero");
  });

  it("reads a Google endpoint back to its model, not a tier", () => {
    expect(
      imageModelIdFromEndpoint(
        `google:${GOOGLE_IMAGE_MODELS["nano-banana"].defaultSlug}`,
        "standard"
      )
    ).toBe("nano");
    expect(
      imageModelIdFromEndpoint(
        `google:${GOOGLE_IMAGE_MODELS["nano-banana-pro"].defaultSlug}`,
        "standard"
      )
    ).toBe("nano-pro");
    expect(
      imageModelIdFromEndpoint(
        `google:${GOOGLE_IMAGE_MODELS["nano-banana-2"].defaultSlug}`,
        "standard"
      )
    ).toBe("nano-2");
  });

  it("keeps an unrecognised Google slug on Google", () => {
    // An env override or a GA rename must not fall back to Seedream.
    expect(imageModelIdFromEndpoint("google:gemini-3-pro-image", "hero")).toBe(
      "nano-pro"
    );
    expect(
      imageModelIdFromEndpoint("google:gemini-3.1-flash-image-preview", "hero")
    ).toBe("nano-2");
    expect(imageModelIdFromEndpoint("google:gemini-9-flash-image", "hero")).toBe(
      "nano"
    );
  });

  it("falls back to the default for anything unknown", () => {
    expect(imageModelIdFromEndpoint(null, null)).toBe(DEFAULT_IMAGE_MODEL_ID);
    expect(imageModelIdFrom("nonsense")).toBe(DEFAULT_IMAGE_MODEL_ID);
  });
});
