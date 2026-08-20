/**
 * Shaping for the usage panel's daily chart.
 *
 * Pure, and separate from the component, because this is the part that can be
 * wrong in ways nobody notices by looking: which day is the busiest, how tall
 * a bar should be when one day dwarfs the month, and what "total" means once
 * the metric switches from money to minutes.
 */

export type DayRow = {
  /** YYYY-MM-DD, already in Dubai time — the server groups by that day. */
  day: string;
  cost: number;
  count: number;
  transcript_count: number;
  audio_seconds: number;
};

export type DailyMetric = "cost" | "count" | "audio";

/** A day's value under the chosen metric. Audio reads in hours, not seconds. */
export function metricValue(day: DayRow, metric: DailyMetric): number {
  if (metric === "cost") return day.cost;
  if (metric === "count") return day.count;
  return day.audio_seconds / 3600;
}

export function formatMetric(value: number, metric: DailyMetric): string {
  if (metric === "cost") return `$${value.toFixed(2)}`;
  if (metric === "count") return String(Math.round(value));
  return `${value.toFixed(1)}h`;
}

export type DailySummary = {
  values: number[];
  total: number;
  max: number;
  /** Days with any activity — the denominator people actually mean. */
  activeDays: number;
  busiestIndex: number;
  busiestDay: string | null;
};

export function summariseDays(days: DayRow[], metric: DailyMetric): DailySummary {
  const values = days.map((day) => metricValue(day, metric));
  const max = values.length ? Math.max(...values) : 0;
  const activeDays = values.filter((value) => value > 0).length;
  // No activity at all means no busiest day — not "the first one".
  const busiestIndex = activeDays > 0 ? values.indexOf(max) : -1;
  return {
    values,
    total: values.reduce((sum, value) => sum + value, 0),
    max,
    activeDays,
    busiestIndex,
    busiestDay: busiestIndex >= 0 ? days[busiestIndex].day : null,
  };
}

/**
 * Bar height as a CSS length.
 *
 * A day with no work is a hairline rather than nothing, so the gap in the
 * month is visible as a gap. A day with work gets a floor of 6% — one busy
 * day used to squash every other day to an invisible sliver, which is how a
 * month with $39 of work managed to look empty.
 */
export function barHeight(value: number, max: number): string {
  if (value <= 0) return "2px";
  if (max <= 0) return "6%";
  return `${Math.max(6, (value / max) * 100)}%`;
}

/** "2026-08-19" → "19 Aug". Parsed as UTC so the label never shifts a day. */
export function shortDate(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
