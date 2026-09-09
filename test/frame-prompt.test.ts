import { describe, expect, it } from "vitest";
import {
  ALWAYS_BANNED,
  castTail,
  coerceBanned,
  coerceCast,
  coerceShots,
  composeFrameNegative,
  composeFramePrompt,
  continuityBrief,
  stripLegacyContinuity,
} from "@/lib/shot-plan";
import { resolveStoryboardStyle } from "@/config/storyboard-styles";

/** The world that produced six near-identical frames on the real board. */
const LOOK = {
  subject: "",
  wardrobe: "",
  location:
    "قطعة زراعية محددة داخل مزرعة حديثة في العين: صفوف متوازية من نباتات خضراء منخفضة",
  lighting: "ضوء الفجر المدني نفسه في جميع اللقطات",
  grade: "تدرج سينمائي طبيعي وهادئ",
};

const BOY = {
  id: "boy",
  name: "الصبي",
  description:
    "صبي إماراتي في الثامنة من عمره، نحيل، ببشرة قمحية دافئة، يرتدي كندورة إماراتية بيضاء خفيفة من القطن وصندل جلدي بني فاتح",
};
const FARMER = {
  id: "farmer",
  name: "المزارع",
  description: "مزارع إماراتي في الستين، لحية بيضاء قصيرة، كندورة بيضاء وغترة",
};

/** Frame 01 — a black screen. The shortest, most easily drowned instruction. */
const FRAME_1 =
  "كادر أسود كامل بلا أي صورة أو عناصر مرئية، يمثل الصمت الذي يسبق ظهور المزرعة.";
const LEGACY = `${FRAME_1} ${continuityBrief({ ...LOOK, subject: BOY.description, wardrobe: "كندورة" })}`;

describe("the block that swallowed the shot", () => {
  it("shows how lopsided the old prompt was", () => {
    // Abridged here; on the real board the block ran to ~900 characters and
    // the frame itself was under a tenth of what the model read.
    expect(FRAME_1.length / LEGACY.length).toBeLessThan(0.2);
  });

  it("recovers the shot from a prompt already stored with the block", () => {
    expect(stripLegacyContinuity(LEGACY)).toBe(FRAME_1);
    expect(stripLegacyContinuity(LEGACY)).not.toMatch(/identical in every shot/);
  });

  it("leaves a clean prompt untouched", () => {
    expect(stripLegacyContinuity(FRAME_1)).toBe(FRAME_1);
  });
});

describe("castTail — people only where the brief puts them", () => {
  it("adds nobody to a frame with an empty cast", () => {
    // The whole point: a landscape beat gets no person invented into it.
    expect(castTail([BOY, FARMER], [])).toBe("");
  });

  it("adds only the characters this frame names", () => {
    const tail = castTail([BOY, FARMER], ["boy"]);
    expect(tail).toContain("كندورة إماراتية بيضاء");
    expect(tail).not.toContain("مزارع إماراتي");
  });

  it("keeps two characters apart when both are in frame", () => {
    const tail = castTail([BOY, FARMER], ["boy", "farmer"]);
    expect(tail).toContain("صبي إماراتي");
    expect(tail).toContain("مزارع إماراتي");
  });

  it("ignores an id that is not in the cast", () => {
    expect(castTail([BOY], ["ghost"])).toBe("");
  });

  it("is bounded so it cannot grow back into a wall of text", () => {
    expect(castTail([BOY, FARMER], ["boy", "farmer"]).length).toBeLessThanOrEqual(320);
  });
});

describe("composeFramePrompt", () => {
  const base = { prompt: FRAME_1, cast: [BOY, FARMER], hasReferences: false };

  it("leads with framing and pairs it with the right focus logic", () => {
    const wide = composeFramePrompt({ ...base, shotSize: "Wide", castIds: [] });
    const macro = composeFramePrompt({
      ...base,
      shotSize: "Extreme close-up",
      castIds: [],
    });
    expect(wide).toMatch(/^Wide shot, deep focus/);
    expect(macro).toMatch(/^Extreme close-up macro, very shallow depth of field/);
  });

  it("puts no character into a frame that names none", () => {
    const out = composeFramePrompt({ ...base, shotSize: "Wide", castIds: [] });
    expect(out).not.toContain("صبي إماراتي");
    expect(out).not.toContain("مزارع إماراتي");
  });

  it("drops the identity text when reference images are carrying it", () => {
    const out = composeFramePrompt({
      ...base,
      shotSize: "Wide",
      castIds: ["boy"],
      hasReferences: true,
    });
    expect(out).not.toContain("كندورة إماراتية بيضاء");
  });

  it("keeps the shot dominant when identity is included", () => {
    const out = composeFramePrompt({ ...base, shotSize: "Wide", castIds: ["boy"] });
    expect(out).toContain(FRAME_1);
    expect(FRAME_1.length / out.length).toBeGreaterThan(0.15);
  });

  it("cleans a legacy prompt on its way to the model", () => {
    const out = composeFramePrompt({
      prompt: LEGACY,
      cast: [],
      castIds: [],
      hasReferences: true,
    });
    expect(out).not.toMatch(/identical in every shot/);
    expect(out).toContain(FRAME_1);
  });

  it("carries the board's visual style", () => {
    const style = resolveStoryboardStyle("painterly_minimal");
    const out = composeFramePrompt({
      ...base,
      castIds: [],
      stylePositive: style.positive,
    });
    expect(out).toContain("minimal gouache-style concept illustration");
    // "Raw as prompted" adds nothing at all.
    expect(
      composeFramePrompt({
        ...base,
        castIds: [],
        stylePositive: resolveStoryboardStyle("raw").positive,
      })
    ).not.toMatch(/gouache|storyboard illustration/);
  });

  it("hands the look to the references when they are attached", () => {
    // The real failure: an illustrated reference attached to the board, and
    // the frame came back photoreal — the style preset and the shot's own
    // photographic language outvoted the picture.
    const out = composeFramePrompt({
      ...base,
      castIds: [],
      hasReferences: true,
      stylePositive: resolveStoryboardStyle("photoreal").positive,
    });
    expect(out).toMatch(/^Render this frame in exactly the visual style/);
    expect(out).not.toContain("photorealistic cinematic film still");
    expect(out).toContain(FRAME_1);
  });

  it("keeps the style preset when no reference is attached", () => {
    const out = composeFramePrompt({
      ...base,
      castIds: [],
      hasReferences: false,
      stylePositive: resolveStoryboardStyle("photoreal").positive,
    });
    expect(out).toContain("photorealistic cinematic film still");
    expect(out).not.toMatch(/visual style of the attached reference/);
  });

  it("keeps the written cast when the references are style-only", () => {
    // The real trap: an illustrated mood reference attached, cast text
    // dropped because "the pictures hold identity" — but a mood board holds
    // nobody's face, so the character arrived described by nothing at all.
    const out = composeFramePrompt({
      ...base,
      shotSize: "Wide",
      castIds: ["boy"],
      hasReferences: true,
      identityInReferences: false,
    });
    expect(out).toContain("كندورة إماراتية بيضاء");
    expect(out).toMatch(/^Render this frame in exactly the visual style/);
  });

  it("binds the analyzed style contract into the prompt", () => {
    const brief =
      "Flat digital gouache illustration, soft undefined edges, warm sand " +
      "beige and dusty sage palette, tiny simplified figures.";
    const out = composeFramePrompt({
      ...base,
      castIds: [],
      hasReferences: true,
      referenceStyle: brief,
    });
    expect(out).toContain(`The reference style, precisely: ${brief}`);
    // The contract rides with the instruction, never instead of it.
    expect(out).toMatch(/^Render this frame in exactly the visual style/);
  });

  it("carries no contract when no reference is attached", () => {
    const out = composeFramePrompt({
      ...base,
      castIds: [],
      hasReferences: false,
      referenceStyle: "gouache illustration",
    });
    expect(out).not.toContain("The reference style, precisely");
  });
});

describe("composeFrameNegative", () => {
  it("always bans invented text, marks and Arabic script", () => {
    const out = composeFrameNegative([]);
    expect(out).toContain("arabic script");
    expect(out).toContain("logo");
    expect(out).toContain("signage");
  });

  it("adds the board's own bans and the style's", () => {
    const out = composeFrameNegative(
      ["buildings", "vehicles"],
      resolveStoryboardStyle("painterly_minimal").negative
    );
    expect(out).toContain("buildings");
    expect(out).toContain("vehicles");
    expect(out).toContain("photorealistic");
    expect(out.startsWith(ALWAYS_BANNED)).toBe(true);
  });
});

describe("planner output coercion", () => {
  it("normalises banned elements into negative-prompt phrases", () => {
    expect(
      coerceBanned({ banned: ["No buildings", "vehicles.", "  OTHER PEOPLE  ", ""] })
    ).toEqual(["buildings", "vehicles", "other people"]);
  });

  it("slugs cast ids and drops entries with no description", () => {
    const cast = coerceCast({
      cast: [
        { id: "The Boy", name: "الصبي", description: "eight years old" },
        { name: "No description" },
      ],
    });
    expect(cast).toHaveLength(1);
    expect(cast[0].id).toBe("the-boy");
  });

  it("keeps a black frame even though it has no picture to describe", () => {
    const shots = coerceShots({
      shots: [
        { title: "Black", prompt: "", isBlank: true, cast: [] },
        { title: "Land", prompt: "wide of the field", cast: [] },
        { title: "Boy", prompt: "the boy walks", cast: ["The Boy"] },
      ],
    });
    expect(shots).toHaveLength(3);
    expect(shots[0].isBlank).toBe(true);
    expect(shots[1].cast).toEqual([]);
    expect(shots[2].cast).toEqual(["the-boy"]);
  });
});
