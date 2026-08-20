import { describe, expect, it } from "vitest";
import {
  activeMentionQuery,
  expandMentions,
  mentionToken,
  parseMentions,
} from "@/lib/mentions";

const TARGETS = [
  { label: "Fatima" },
  { label: null },
  { label: "ACME bottle" },
];

describe("mentionToken", () => {
  it("is 1-based, matching the badge on the thumbnail", () => {
    expect(mentionToken(0)).toBe("@image1");
    expect(mentionToken(2)).toBe("@image3");
  });
});

describe("parseMentions", () => {
  it("finds mentions in first-use order without duplicates", () => {
    expect(parseMentions("@image3 meets @image1, then @image3 again", 3)).toEqual([2, 0]);
  });

  it("ignores a mention pointing past the attachments", () => {
    // A token left behind after its image was removed must not silently
    // address whatever now sits in that slot.
    expect(parseMentions("@image4 walks in", 3)).toEqual([]);
  });

  it("finds nothing in a prompt with no mentions", () => {
    expect(parseMentions("a desert highway at dawn", 3)).toEqual([]);
  });
});

describe("expandMentions", () => {
  it("leaves a prompt with no mentions completely alone", () => {
    const text = "a desert highway at dawn";
    expect(expandMentions(text, TARGETS)).toBe(text);
  });

  it("names the reference by number and binds it", () => {
    const out = expandMentions("A wide shot of @image1 in the field", TARGETS);
    expect(out).toContain("reference image 1 (Fatima)");
    expect(out).not.toContain("@image1");
    expect(out).toMatch(/Match reference image 1 \(Fatima\) exactly/);
  });

  it("closes the sentence before the instruction rather than running on", () => {
    const out = expandMentions("A wide shot of @image1 in the field", TARGETS);
    expect(out).toContain("in the field. Match");
  });

  it("keeps punctuation the prompt already ended with", () => {
    const out = expandMentions("A wide shot of @image1.", TARGETS);
    expect(out).not.toContain("..");
    expect(out).toContain("). Match");
  });

  it("does not assume the reference is a person", () => {
    // A bottle has no face or wardrobe.
    const out = expandMentions("Close on @image3", TARGETS);
    expect(out).not.toMatch(/same face|same wardrobe/);
    expect(out).toContain("same subject");
  });

  it("falls back to the number when the attachment has no name", () => {
    const out = expandMentions("Close on @image2", TARGETS);
    expect(out).toContain("reference image 2");
    expect(out).not.toContain("(");
  });

  it("lists several mentions readably", () => {
    const out = expandMentions("@image1 holding @image3", TARGETS);
    expect(out).toMatch(
      /Match reference image 1 \(Fatima\) and reference image 3 \(ACME bottle\) exactly/
    );
  });

  it("leaves an out-of-range token as written rather than rebinding it", () => {
    const out = expandMentions("@image9 waits", TARGETS);
    expect(out).toBe("@image9 waits");
  });
});

describe("activeMentionQuery", () => {
  const at = (text: string) => activeMentionQuery(text, text.length);

  it("opens on a bare @", () => {
    expect(at("A shot of @")).toMatchObject({ query: "" });
  });

  it("captures what has been typed so far", () => {
    expect(at("A shot of @fat")).toMatchObject({ query: "fat" });
  });

  it("reports the range to replace", () => {
    const q = at("A shot of @fat")!;
    expect("A shot of @fat".slice(q.start, q.end)).toBe("@fat");
  });

  it("does not open inside an email address", () => {
    expect(at("mail me at yazan@yazmedia")).toBeNull();
  });

  it("closes once a space is typed", () => {
    expect(at("A shot of @image1 walking")).toBeNull();
  });

  it("is null with no @ at all", () => {
    expect(at("a desert highway")).toBeNull();
  });

  it("tracks the caret, not the end of the text", () => {
    const text = "A @fa shot of a field";
    expect(activeMentionQuery(text, 5)).toMatchObject({ query: "fa" });
  });
});

describe("buildPrompt expands mentions on the server", () => {
  it("turns a tag into an indexed instruction the model can act on", async () => {
    const { buildPrompt } = await import("@/lib/prompt");
    const { finalPrompt } = buildPrompt({
      subject: "A wide shot of @image1 walking between the crop rows",
      referenceLabels: ["Fatima", null],
    });
    expect(finalPrompt).toContain("reference image 1 (Fatima)");
    expect(finalPrompt).not.toContain("@image1");
    expect(finalPrompt).toMatch(/Match reference image 1 \(Fatima\) exactly/);
  });

  it("leaves a prompt with no tags byte-identical", async () => {
    const { buildPrompt } = await import("@/lib/prompt");
    const plain = buildPrompt({ subject: "a red sports car" }).finalPrompt;
    const withLabels = buildPrompt({
      subject: "a red sports car",
      referenceLabels: ["Fatima"],
    }).finalPrompt;
    expect(plain).toBe("a red sports car");
    expect(withLabels).toBe(plain);
  });
});
