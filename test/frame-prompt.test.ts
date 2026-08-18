import { describe, expect, it } from "vitest";
import {
  composeFramePrompt,
  continuityBrief,
  identityTail,
  stripLegacyContinuity,
} from "@/lib/shot-plan";

/** The look that produced six near-identical frames on the real board. */
const LOOK = {
  subject:
    "صبي إماراتي في الثامنة من عمره، نحيل، ببشرة قمحية دافئة، شعره أسود قصير ومقصوص بعناية، وله شامة صغيرة واضحة على خده الأيسر؛ هو الطفل الوحيد الظاهر في الحملة",
  wardrobe:
    "كندورة إماراتية بيضاء خفيفة من القطن، بأكمام طويلة وياقة بسيطة وأزرار بيضاء صغيرة، تصل إلى الكاحل؛ صندل جلدي بني فاتح مكشوف؛ من دون غترة أو أي إكسسوارات",
  location:
    "قطعة زراعية محددة داخل مزرعة حديثة في العين: صفوف متوازية من نباتات خضراء منخفضة، خطوط ري بالتنقيط ظاهرة بين الصفوف، نخيل تمر ناضج على الحافة البعيدة",
  lighting:
    "ضوء الفجر المدني نفسه في جميع اللقطات: شمس ما قبل الشروق خلف الصفوف، إضاءة زرقاء ناعمة منخفضة التباين",
  grade: "تدرج سينمائي طبيعي وهادئ: ظلال زرقاء رمادية باردة، خضار زيتونية واقعية",
};

/** Frame 01 — a black screen. The shortest, most easily drowned instruction. */
const FRAME_1 =
  "كادر أسود كامل بلا أي صورة أو عناصر مرئية، يمثل الصمت الذي يسبق ظهور المزرعة.";

const LEGACY = `${FRAME_1} ${continuityBrief(LOOK)}`;

describe("the block that swallowed the shot", () => {
  it("shows how lopsided the old prompt was", () => {
    // Roughly a 1:11 split — the frame itself was under a tenth of what the
    // model read, and the other nine tenths were identical on every frame.
    expect(FRAME_1.length / LEGACY.length).toBeLessThan(0.1);
  });

  it("recovers the shot from a prompt already stored with the block", () => {
    expect(stripLegacyContinuity(LEGACY)).toBe(FRAME_1);
    expect(stripLegacyContinuity(LEGACY)).not.toMatch(/identical in every shot/);
  });

  it("leaves a clean prompt untouched", () => {
    expect(stripLegacyContinuity(FRAME_1)).toBe(FRAME_1);
  });
});

describe("identityTail", () => {
  it("keeps only who they are and what they wear", () => {
    const tail = identityTail(LOOK);
    expect(tail).toContain("صبي إماراتي");
    expect(tail).toContain("كندورة");
    // Location, lighting and grade belong to the shot, which may change.
    expect(tail).not.toContain("مزرعة حديثة في العين");
    expect(tail).not.toContain("ضوء الفجر");
    expect(tail).not.toContain("تدرج سينمائي");
  });

  it("carries no meta-instruction an image model cannot act on", () => {
    expect(identityTail(LOOK)).not.toMatch(/identical|unchanged|every shot/i);
  });

  it("is bounded, so it cannot grow back into a wall of text", () => {
    expect(identityTail(LOOK).length).toBeLessThanOrEqual(260);
    expect(identityTail(LOOK).length).toBeLessThan(continuityBrief(LOOK).length / 2);
  });

  it("is empty without a look", () => {
    expect(identityTail(null)).toBe("");
  });
});

describe("composeFramePrompt", () => {
  it("leads with the framing so shot size actually reaches the model", () => {
    const out = composeFramePrompt({
      prompt: FRAME_1,
      shotSize: "Extreme close-up",
      look: LOOK,
      hasReferences: false,
    });
    expect(out.startsWith("Extreme close-up shot.")).toBe(true);
  });

  it("drops the identity tail when reference images are carrying it", () => {
    const withRefs = composeFramePrompt({
      prompt: FRAME_1,
      shotSize: "Wide",
      look: LOOK,
      hasReferences: true,
    });
    expect(withRefs).toBe(`Wide shot. ${FRAME_1}`);
    expect(withRefs).not.toContain("كندورة إماراتية بيضاء خفيفة");
  });

  it("keeps the shot dominant even when the tail is included", () => {
    const out = composeFramePrompt({
      prompt: FRAME_1,
      shotSize: "Wide",
      look: LOOK,
      hasReferences: false,
    });
    expect(out).toContain(FRAME_1);
    // Was under 10% of the prompt; now the frame carries real weight.
    expect(FRAME_1.length / out.length).toBeGreaterThan(0.2);
    expect(out.length).toBeLessThan(LEGACY.length / 2);
  });

  it("cleans a legacy prompt on its way to the model", () => {
    const out = composeFramePrompt({
      prompt: LEGACY,
      shotSize: null,
      look: LOOK,
      hasReferences: true,
    });
    expect(out).toBe(FRAME_1);
  });
});
