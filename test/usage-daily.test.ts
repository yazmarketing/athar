import { describe, expect, it } from "vitest";
import {
  barHeight,
  formatMetric,
  metricValue,
  parseUsageRange,
  shortDate,
  summariseDays,
  type DayRow,
} from "@/lib/usage";

const day = (
  d: string,
  cost = 0,
  count = 0,
  transcript_count = 0,
  audio_seconds = 0
): DayRow => ({ day: d, cost, count, transcript_count, audio_seconds });

/** The shape the studio actually had: a quiet start, then one very busy day. */
const MONTH: DayRow[] = [
  day("2026-08-06"),
  day("2026-08-07"),
  day("2026-08-10", 0.08, 4),
  day("2026-08-11", 2.94, 17),
  day("2026-08-19", 25.35, 72, 3, 5400),
];

describe("metricValue", () => {
  it("reads audio in hours, not seconds", () => {
    expect(metricValue(MONTH[4], "audio")).toBe(1.5);
    expect(metricValue(MONTH[4], "cost")).toBe(25.35);
    expect(metricValue(MONTH[4], "count")).toBe(72);
  });
});

describe("formatMetric", () => {
  it("formats each metric in its own units", () => {
    expect(formatMetric(25.348, "cost")).toBe("$25.35");
    expect(formatMetric(72, "count")).toBe("72");
    expect(formatMetric(1.5, "audio")).toBe("1.5h");
  });
});

describe("summariseDays", () => {
  it("totals the window and finds the busiest day", () => {
    const s = summariseDays(MONTH, "cost");
    expect(s.total).toBeCloseTo(28.37, 2);
    expect(s.max).toBe(25.35);
    expect(s.busiestDay).toBe("2026-08-19");
  });

  it("counts only days that had activity", () => {
    // Two of the five days are empty — "5 active days" would be a lie.
    expect(summariseDays(MONTH, "cost").activeDays).toBe(3);
  });

  it("changes its answer with the metric", () => {
    // Busiest by spend and busiest by volume can be different days; the whole
    // point of the toggle is that you can see when they are.
    const spendy = [day("2026-01-01", 30, 2), day("2026-01-02", 3, 40)];
    expect(summariseDays(spendy, "cost").busiestDay).toBe("2026-01-01");
    expect(summariseDays(spendy, "count").busiestDay).toBe("2026-01-02");
  });

  it("reports no busiest day when nothing happened", () => {
    const empty = summariseDays([day("2026-08-06"), day("2026-08-07")], "cost");
    expect(empty.activeDays).toBe(0);
    expect(empty.busiestDay).toBeNull();
    expect(empty.total).toBe(0);
  });

  it("survives an empty window", () => {
    const none = summariseDays([], "cost");
    expect(none.max).toBe(0);
    expect(none.busiestIndex).toBe(-1);
  });
});

describe("barHeight", () => {
  it("keeps a quiet day visible next to a huge one", () => {
    // $0.08 against a $25.35 peak is 0.3% — a bar nobody can see. This is the
    // bug the old chart had: ten days of work looked like one day of work.
    expect(barHeight(0.08, 25.35)).toBe("6%");
    expect(barHeight(25.35, 25.35)).toBe("100%");
    expect(barHeight(12.675, 25.35)).toBe("50%");
  });

  it("draws a day with no work as a hairline, not nothing", () => {
    expect(barHeight(0, 25.35)).toBe("2px");
  });

  it("does not divide by zero on an empty month", () => {
    expect(barHeight(0, 0)).toBe("2px");
    expect(barHeight(5, 0)).toBe("6%");
  });
});

describe("shortDate", () => {
  it("labels the day the server grouped by, without a timezone shift", () => {
    expect(shortDate("2026-08-19")).toBe("19 Aug");
    expect(shortDate("2026-01-01")).toBe("1 Jan");
  });

  it("returns nothing for a missing day rather than 'Invalid Date'", () => {
    expect(shortDate("")).toBe("");
  });
});

describe("parseUsageRange", () => {
  const today = "2026-08-26";

  it("all-time has no bounds", () => {
    expect(parseUsageRange({ range: "all", today })).toEqual({
      kind: "all",
      from: null,
      to: null,
    });
  });

  it("a day is that Dubai date, exclusive the next morning", () => {
    expect(
      parseUsageRange({ range: "day", date: "2026-08-15", today })
    ).toEqual({
      kind: "day",
      from: "2026-08-15",
      to: "2026-08-16",
    });
  });

  it("a month runs from the 1st to the 1st of the next", () => {
    expect(
      parseUsageRange({ range: "month", month: "2026-08", today })
    ).toEqual({
      kind: "month",
      from: "2026-08-01",
      to: "2026-09-01",
    });
  });

  it("December rolls the year", () => {
    expect(
      parseUsageRange({ range: "month", month: "2026-12", today })
    ).toEqual({
      kind: "month",
      from: "2026-12-01",
      to: "2027-01-01",
    });
  });

  it("falls back to today when the pickers are empty", () => {
    expect(parseUsageRange({ range: "day", today }).from).toBe("2026-08-26");
    expect(parseUsageRange({ range: "month", today }).from).toBe("2026-08-01");
  });
});
