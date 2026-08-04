import { describe, expect, it } from "vitest";
import { inDateRange, localIso, presetRange } from "./DateRangeFilter";

describe("localIso", () => {
  it("formats local date without UTC shift", () => {
    const d = new Date(2026, 0, 1, 0, 30, 0); // Jan 1 00:30 local
    expect(localIso(d)).toBe("2026-01-01");
  });

  it("pads single-digit month and day", () => {
    const d = new Date(2026, 7, 4); // Aug 4
    expect(localIso(d)).toBe("2026-08-04");
  });
});

describe("presetRange", () => {
  const today = new Date(2026, 7, 4); // Aug 4, 2026

  it("thismonth: from = 1st of month, to = today", () => {
    const r = presetRange("thismonth", today);
    expect(r).toEqual({ from: "2026-08-01", to: "2026-08-04", preset: "thismonth" });
  });

  it("today: from = to = today", () => {
    const r = presetRange("today", today);
    expect(r).toEqual({ from: "2026-08-04", to: "2026-08-04", preset: "today" });
  });

  it("7d: 7-day window", () => {
    const r = presetRange("7d", today);
    expect(r).toEqual({ from: "2026-07-29", to: "2026-08-04", preset: "7d" });
  });

  it("30d: 30-day window", () => {
    const r = presetRange("30d", today);
    expect(r).toEqual({ from: "2026-07-06", to: "2026-08-04", preset: "30d" });
  });

  it("all: empty range", () => {
    const r = presetRange("all", today);
    expect(r).toEqual({ from: "", to: "", preset: "all" });
  });

  it("unknown preset falls back to all", () => {
    const r = presetRange("whatever", today);
    expect(r).toEqual({ from: "", to: "", preset: "all" });
  });
});

describe("inDateRange with presetRange", () => {
  const range = presetRange("thismonth", new Date(2026, 7, 4));

  it("includes PR created this month", () => {
    expect(inDateRange("2026-08-02T14:30:00", range)).toBe(true);
  });

  it("includes PR created on the 1st at midnight", () => {
    expect(inDateRange("2026-08-01T00:00:00", range)).toBe(true);
  });

  it("excludes PR from previous month", () => {
    expect(inDateRange("2026-07-31T23:59:59", range)).toBe(false);
  });

  it("includes PR created today", () => {
    expect(inDateRange("2026-08-04T15:00:00", range)).toBe(true);
  });
});
