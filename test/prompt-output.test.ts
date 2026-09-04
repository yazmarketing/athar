import { describe, expect, it } from "vitest";
import { inferOutputSettings } from "@/lib/prompt-output";

const LIWA = `
SCENE CONTEXT
A single continuous aerial flight over the Liwa dunes, shot vertical.

FORMAT MODE
One continuous shot, the camera does not cut on its own. Real time from start to finish.

CAMERA
0.0s to 2.0s — 12 metres above the sand.
2.0s to 4.5s — the camera crests the ridge.
4.5s to 7.5s — camera climbs from 55 to 150 metres.
7.5s to 9.3s — camera decelerates.
9.3s to 10.0s — camera fully stationary.

OUTPUT SETTINGS
9:16 vertical, 4K to 8K, real time throughout, 24 fps.

POSITIVE LOCKS
Vertical 9:16 framing for the entire shot.
`;

describe("inferOutputSettings", () => {
  it("reads 9:16 and the 10s timeline from a director prompt", () => {
    expect(inferOutputSettings(LIWA)).toEqual({
      aspect: "9:16",
      durationS: 10,
    });
  });

  it("treats 'shot vertical' as 9:16 when no ratio token is present", () => {
    expect(inferOutputSettings("A dune flyover, shot vertical.").aspect).toBe(
      "9:16"
    );
  });

  it("does not treat 'portrait lens' or a vertical boom as a frame format", () => {
    expect(
      inferOutputSettings("an elderly fisherman, 85mm portrait lens").aspect
    ).toBeUndefined();
    expect(
      inferOutputSettings(
        "cinematic crane shot rising upward, smooth vertical boom move"
      ).aspect
    ).toBeUndefined();
  });

  it("lets the last explicit ratio win", () => {
    expect(
      inferOutputSettings("Start 16:9. OUTPUT SETTINGS 9:16 vertical.").aspect
    ).toBe("9:16");
    expect(inferOutputSettings("9:16 then finish 16:9 widescreen.").aspect).toBe(
      "16:9"
    );
  });

  it("reads 1:1 from a square-format line", () => {
    expect(inferOutputSettings("square format 1:1 product hero").aspect).toBe(
      "1:1"
    );
  });

  it("reads the extra landscape and portrait ratios", () => {
    expect(inferOutputSettings("OUTPUT SETTINGS 4:3 horizontal.").aspect).toBe(
      "4:3"
    );
    expect(inferOutputSettings("framed 3:4 for print").aspect).toBe("3:4");
    expect(inferOutputSettings("3:2 photo crop").aspect).toBe("3:2");
    expect(inferOutputSettings("2:3 vertical still").aspect).toBe("2:3");
    expect(inferOutputSettings("5:4 landscape poster").aspect).toBe("5:4");
    expect(inferOutputSettings("9:21 tall ultrawide").aspect).toBe("9:21");
  });

  it("leaves short prompts that never name a format alone", () => {
    expect(inferOutputSettings("a camel walks across a dune")).toEqual({});
  });

  it("does not treat a single 5s mention as clip length", () => {
    expect(inferOutputSettings("hold for 5s then cut").durationS).toBeUndefined();
  });
});
