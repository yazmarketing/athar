import { describe, expect, it } from "vitest";
import {
  CAMERA_PRESETS,
  DEFAULT_CAMERA_ID,
  resolveCamera,
} from "@/config/camera";

describe("camera presets", () => {
  it("defaults to raw — no camera direction imposed on a prompt", () => {
    expect(DEFAULT_CAMERA_ID).toBe("raw");
    expect(resolveCamera(null).id).toBe("raw");
    expect(resolveCamera(undefined).fragment).toBe("");
  });

  it("offers raw first, so it is the obvious choice in the picker", () => {
    expect(CAMERA_PRESETS[0].id).toBe("raw");
  });

  it("gives every other preset an actual motion fragment", () => {
    for (const preset of CAMERA_PRESETS) {
      if (preset.id === "raw") continue;
      expect(preset.fragment.trim(), `${preset.id} has no fragment`).not.toBe(
        ""
      );
    }
  });

  it("makes locked-off mean a locked camera, not an absent one", () => {
    const locked = resolveCamera("locked");
    expect(locked.fragment).toMatch(/locked-off|no camera movement/i);
  });

  it("falls back to raw for an unknown id", () => {
    expect(resolveCamera("does-not-exist").id).toBe("raw");
  });
});
