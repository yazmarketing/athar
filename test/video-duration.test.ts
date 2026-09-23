import { describe, expect, it } from "vitest";
import { suggestVideoDuration } from "../src/lib/video-duration";

describe("automatic video timing", () => {
  it("keeps descriptive single shots short", () => {
    expect(suggestVideoDuration("Close-up of perfume, slow camera push, warm lighting", 30).seconds).toBe(5);
  });
  it("allows time for sequential action", () => {
    expect(suggestVideoDuration("She enters then picks up the product then smiles", 30).seconds).toBe(9);
  });
  it("honours explicit timing within model limits", () => {
    expect(suggestVideoDuration("A 10-second tracking shot", 30).seconds).toBe(10);
    expect(suggestVideoDuration("A 30 second shot", 15)).toMatchObject({ seconds: 15 });
    expect(suggestVideoDuration("A 2s shot", 30).seconds).toBe(4);
  });
  it("estimates spoken dialogue without treating a long visual description as speech", () => {
    expect(suggestVideoDuration('She says: "Welcome to our beautiful new store where you can discover something special for every occasion and everyone you love."', 30).seconds).toBe(10);
  });
  it("suggests splitting multiple shots", () => {
    expect(suggestVideoDuration("A montage of city scenes", 30)).toMatchObject({seconds: 10, reason: expect.stringContaining("separately")});
  });
});
