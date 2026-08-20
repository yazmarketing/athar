import { describe, expect, it } from "vitest";
import {
  buildCues,
  formatClock,
  formatTimecode,
  speakerLabel,
  toCsv,
  toPlainText,
  toSrt,
  wrapLines,
} from "@/lib/subtitles";
import type { SubtitleSegment } from "@/lib/subtitles";

const words = (text: string, start: number, step = 0.4) =>
  text.split(" ").map((w, i) => ({ w, s: start + i * step, e: start + (i + 1) * step }));

describe("formatTimecode", () => {
  it("writes SRT timecodes with a comma and three-digit milliseconds", () => {
    expect(formatTimecode(3661.5)).toBe("01:01:01,500");
    expect(formatTimecode(0)).toBe("00:00:00,000");
  });

  it("writes VTT timecodes with a dot", () => {
    expect(formatTimecode(9.25, ".")).toBe("00:00:09.250");
  });

  it("never goes negative", () => {
    expect(formatTimecode(-4)).toBe("00:00:00,000");
  });
});

describe("formatClock", () => {
  it("drops the hour until there is one", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3675)).toBe("1:01:15");
  });
});

describe("speakerLabel", () => {
  it("prefers the name someone typed", () => {
    expect(speakerLabel("SPEAKER_00", { SPEAKER_00: "Yazan" })).toBe("Yazan");
  });

  it("falls back to a 1-based label rather than the raw diarizer tag", () => {
    expect(speakerLabel("SPEAKER_02")).toBe("Speaker 3");
  });

  it("is empty when there is no speaker", () => {
    expect(speakerLabel(null)).toBe("");
  });
});

describe("wrapLines", () => {
  it("wraps at the character budget on word boundaries", () => {
    expect(wrapLines("the quick brown fox jumps over", 15, 2)).toEqual([
      "the quick brown",
      "fox jumps over",
    ]);
  });

  it("folds the overflow into the last line rather than dropping it", () => {
    const lines = wrapLines("one two three four five six seven eight", 10, 2);
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).toContain("eight");
  });
});

describe("buildCues", () => {
  it("splits a long segment at word boundaries using the word timings", () => {
    const segment: SubtitleSegment = {
      start_s: 0,
      end_s: 12,
      text: "we opened the campaign in Riyadh and then took the whole thing to Jeddah the following week",
      words: words(
        "we opened the campaign in Riyadh and then took the whole thing to Jeddah the following week",
        0
      ),
    };
    const cues = buildCues([segment], { maxChars: 42, maxLines: 2 });
    expect(cues.length).toBeGreaterThan(1);
    // Every cue starts on a real word boundary from the decoder.
    expect(cues[1].start_s).toBeGreaterThan(cues[0].start_s);
    expect(cues.flatMap((c) => c.lines).join(" ")).toContain("Jeddah");
  });

  it("holds a short cue on screen long enough to read", () => {
    const cues = buildCues(
      [{ start_s: 4, end_s: 4.2, text: "Yes." }],
      { minDurationS: 1.2 }
    );
    expect(cues[0].end_s - cues[0].start_s).toBeCloseTo(1.2, 3);
  });

  it("never lets a cue run into the next one", () => {
    const cues = buildCues(
      [
        { start_s: 0, end_s: 0.3, text: "Right." },
        { start_s: 0.9, end_s: 2, text: "So here is the plan." },
      ],
      { minDurationS: 2, gapS: 0.1 }
    );
    expect(cues[0].end_s).toBeLessThanOrEqual(cues[1].start_s - 0.1 + 1e-9);
  });

  it("caps a cue that would otherwise sit there for half a minute", () => {
    const cues = buildCues([{ start_s: 0, end_s: 30, text: "Hello." }], {
      maxDurationS: 6,
    });
    expect(cues[0].end_s).toBeCloseTo(6, 3);
  });

  it("stacks the translation above the original for bilingual subtitles", () => {
    const cues = buildCues(
      [
        {
          start_s: 0,
          end_s: 3,
          text: "Welcome to the studio.",
          translations: { ar: "أهلا بك في الاستوديو." },
        },
      ],
      { bilingualLang: "ar" }
    );
    expect(cues[0].lines[0]).toBe("أهلا بك في الاستوديو.");
    expect(cues[0].lines[1]).toBe("Welcome to the studio.");
  });
});

describe("toSrt", () => {
  it("numbers cues from 1 and uses the arrow format editors expect", () => {
    const srt = toSrt([{ start_s: 0, end_s: 2, text: "Action." }]);
    expect(srt.split("\n")[0]).toBe("1");
    expect(srt).toContain("00:00:00,000 --> 00:00:02,000");
  });

  it("prefixes the speaker only when asked", () => {
    const segments: SubtitleSegment[] = [
      { start_s: 0, end_s: 2, text: "Action.", speaker: "SPEAKER_00" },
    ];
    expect(toSrt(segments)).not.toContain("Yazan:");
    expect(
      toSrt(segments, { speakers: true, speakerNames: { SPEAKER_00: "Yazan" } })
    ).toContain("Yazan: Action.");
  });
});

describe("toPlainText", () => {
  const segments: SubtitleSegment[] = [
    { start_s: 0, end_s: 2, text: "So um we start in Riyadh.", speaker: "SPEAKER_00" },
    { start_s: 2, end_s: 4, text: "Then Jeddah.", speaker: "SPEAKER_00" },
    { start_s: 4, end_s: 6, text: "And the budget?", speaker: "SPEAKER_01" },
  ];

  it("joins one speaker's consecutive lines into a single paragraph", () => {
    const text = toPlainText(segments, {
      speakerNames: { SPEAKER_00: "Yazan", SPEAKER_01: "Client" },
    });
    const blocks = text.trim().split("\n\n");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("Yazan:");
    expect(blocks[0]).toContain("Then Jeddah.");
    expect(blocks[1]).toContain("Client:");
  });

  it("strips fillers in clean mode", () => {
    const text = toPlainText(segments, { clean: true, timestamps: "none" });
    expect(text).not.toContain(" um ");
    expect(text).toContain("we start in Riyadh.");
  });

  it("omits timecodes when asked", () => {
    expect(toPlainText(segments, { timestamps: "none" })).not.toContain("[0:00]");
  });
});

describe("toCsv", () => {
  it("escapes quotes so a quoted line cannot break the column count", () => {
    const csv = toCsv([{ start_s: 0, end_s: 1, text: 'He said "go".' }]);
    expect(csv.split("\n")[1]).toContain('"He said ""go""."');
  });
});
