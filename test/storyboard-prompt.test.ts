import { describe, expect, it } from "vitest";
import {
  ANGLES,
  REGISTERS,
  SHOT_SIZES,
  buildEntityPrompt,
  buildPanelPrompt,
  enforceScreenDirection,
  slugify,
  stripMotion,
} from "@/lib/storyboard-prompt";
import type { StoryboardEntityRecord } from "@/lib/types";

function entity(
  over: Partial<StoryboardEntityRecord> = {}
): StoryboardEntityRecord {
  return {
    id: "e1",
    storyboard_id: "b1",
    slug: "layla",
    kind: "character",
    name: "Layla",
    description: "Emirati woman in her thirties, tall, dark curls",
    wardrobe: "a flowing black abaya with a shayla",
    reference_url: null,
    approved_at: null,
    seed: 42,
    position: 0,
    created_at: "",
    ...over,
  };
}

describe("stripMotion", () => {
  it("pulls camera language out of a still description", () => {
    const { still, motion } = stripMotion(
      "She sets the cup down. The camera pushes in on her hands."
    );
    expect(still).toBe("She sets the cup down.");
    expect(motion).toMatch(/camera pushes in/i);
  });

  it("leaves a clean frame description alone", () => {
    const text = "She sets the cup down on the low table.";
    expect(stripMotion(text).still).toBe(text);
    expect(stripMotion(text).motion).toBe("");
  });

  it("catches transitions, which read as instructions to an image model", () => {
    expect(stripMotion("He turns. Cuts to the door.").motion).toBeTruthy();
    expect(stripMotion("Wide of the room, slow motion.").motion).toBeTruthy();
  });
});

describe("enforceScreenDirection", () => {
  const panel = (over: Record<string, unknown> = {}) => ({
    screenDirection: "left",
    entitySlugs: ["layla"],
    shotSize: "MS",
    ...over,
  });

  it("holds the established direction across a scene", () => {
    const out = enforceScreenDirection([
      panel({ screenDirection: "left" }),
      panel({ screenDirection: "right" }),
      panel({ screenDirection: "right" }),
    ]);
    // Once Layla faces left in a medium, she keeps facing left — flipping
    // her mid-scene is the line-crossing an audience feels but can't name.
    expect(out.map((p) => p.screenDirection)).toEqual([
      "left",
      "left",
      "left",
    ]);
  });

  it("allows a wide to re-establish the geography", () => {
    const out = enforceScreenDirection([
      panel({ screenDirection: "left" }),
      panel({ screenDirection: "right", shotSize: "WS" }),
      panel({ screenDirection: "right" }),
    ]);
    expect(out[1].screenDirection).toBe("right");
    expect(out[2].screenDirection).toBe("right");
  });

  it("tracks each grouping separately", () => {
    const out = enforceScreenDirection([
      panel({ screenDirection: "left", entitySlugs: ["layla"] }),
      panel({ screenDirection: "right", entitySlugs: ["omar"] }),
    ]);
    // Two people in conversation face opposite ways — that's correct, not a
    // continuity error.
    expect(out[1].screenDirection).toBe("right");
  });

  it("never rewrites a to-camera panel", () => {
    const out = enforceScreenDirection([
      panel({ screenDirection: "left" }),
      panel({ screenDirection: "to-camera" }),
    ]);
    expect(out[1].screenDirection).toBe("to-camera");
  });
});

describe("buildPanelPrompt", () => {
  const base = {
    shot_size: "CU" as const,
    angle: "low" as const,
    lens: "85mm",
    screen_direction: "left" as const,
    action: "She looks up from the cup",
  };

  it("leads with the register, so style governs the frame", () => {
    const prompt = buildPanelPrompt({
      panel: base,
      entities: [entity()],
      register: "sketch",
      look: null,
    });
    expect(prompt.startsWith(REGISTERS.sketch)).toBe(true);
  });

  it("spells out the shot size and angle rather than passing the code", () => {
    const prompt = buildPanelPrompt({
      panel: base,
      entities: [entity()],
      register: "sketch",
      look: null,
    });
    expect(prompt).toContain(SHOT_SIZES.CU);
    expect(prompt).toContain(ANGLES.low);
    expect(prompt).not.toMatch(/\bshot_size\b/);
  });

  it("carries the wardrobe, which is what actually drifts between panels", () => {
    const prompt = buildPanelPrompt({
      panel: base,
      entities: [entity()],
      register: "sketch",
      look: null,
    });
    expect(prompt).toContain("flowing black abaya with a shayla");
  });

  it("bans text in frame — a caption can't be edited out later", () => {
    const prompt = buildPanelPrompt({
      panel: base,
      entities: [],
      register: "line",
      look: null,
    });
    expect(prompt).toMatch(/no text/i);
  });

  it("appends a correction so a retry knows what missed", () => {
    const prompt = buildPanelPrompt({
      panel: base,
      entities: [entity()],
      register: "sketch",
      look: null,
      correction: "Wrong hair colour",
    });
    expect(prompt).toContain("Wrong hair colour");
  });

  it("applies the board's lighting and grade", () => {
    const prompt = buildPanelPrompt({
      panel: base,
      entities: [],
      register: "photoreal",
      look: { lighting: "hard afternoon sun", grade: "warm sand tones" },
    });
    expect(prompt).toContain("hard afternoon sun");
    expect(prompt).toContain("warm sand tones");
  });
});

describe("buildEntityPrompt", () => {
  it("asks for a plain sheet, not a staged shot", () => {
    const prompt = buildEntityPrompt({
      entity: entity(),
      register: "sketch",
      look: null,
    });
    expect(prompt).toMatch(/reference sheet/i);
    expect(prompt).toMatch(/neutral expression/i);
    expect(prompt).toContain("Layla");
  });

  it("frames a location as empty — people belong in panels", () => {
    const prompt = buildEntityPrompt({
      entity: entity({ kind: "location", name: "Majlis" }),
      register: "mono",
      look: null,
    });
    expect(prompt).toMatch(/no people in frame/i);
  });
});

describe("slugify", () => {
  it("makes a stable handle panels can reference", () => {
    expect(slugify("Layla Al Mansoori")).toBe("layla-al-mansoori");
    expect(slugify("Majlis — Interior (night)")).toBe("majlis-interior-night");
  });

  it("never returns an empty slug", () => {
    expect(slugify("!!!")).toBe("entity");
    expect(slugify("")).toBe("entity");
  });
});
