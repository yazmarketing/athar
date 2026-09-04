import { describe, expect, it } from "vitest";
import { friendlyModelName } from "@/config/models";

describe("friendlyModelName", () => {
  it("maps the endpoints actually present in the database", () => {
    expect(friendlyModelName("byteplus:seedream-4-0-250828")).toBe("Seedream 4.0");
    expect(friendlyModelName("byteplus:seedream-5-0-260128")).toBe("Seedream 5.0");
    expect(friendlyModelName("byteplus:dola-seedream-5-0-pro-260628")).toBe("Seedream 5.0 Pro");
    expect(friendlyModelName("byteplus:dreamina-seedance-2-5-260628")).toBe("Seedance 2.5");
  });

  it("handles the remaining registry slugs", () => {
    expect(friendlyModelName("byteplus:dreamina-seedance-2-0-mini-260615")).toBe("Seedance 2.0 Mini");
    expect(friendlyModelName("nano-banana")).toBe("Nano Banana");
    expect(friendlyModelName("nano-banana-2")).toBe("Nano Banana 2");
    expect(friendlyModelName("openai:gpt-image-2")).toBe("GPT Image 2");
  });

  it("tidies an unknown slug instead of leaking the raw id", () => {
    expect(friendlyModelName("byteplus:dreamina-seedance-3-0-ultra-270101")).toBe("Seedance 3.0 Ultra");
  });

  it("is safe on empty input", () => {
    expect(friendlyModelName(null)).toBe("—");
    expect(friendlyModelName("")).toBe("—");
  });
});
