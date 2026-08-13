import { describe, it, expect } from "vitest";
import {
  eachDate,
  fromISODate,
  getWeekInfo,
  getWeekRange,
  toISODate,
} from "@/lib/dates";

describe("getWeekRange", () => {
  it("returns the Monday-to-Sunday range containing the date", () => {
    // 2026-06-24 is a Wednesday.
    const { start, end } = getWeekRange(new Date("2026-06-24T12:00:00Z"));
    expect(toISODate(start)).toBe("2026-06-22"); // Monday
    expect(toISODate(end)).toBe("2026-06-28"); // Sunday
  });

  it("treats Sunday as the end of the week, not the start", () => {
    const { start, end } = getWeekRange(new Date("2026-06-28T12:00:00Z"));
    expect(toISODate(start)).toBe("2026-06-22");
    expect(toISODate(end)).toBe("2026-06-28");
  });

  it("is stable across times of day, including UTC midnight boundaries", () => {
    // Tasks are stored at UTC midnight. If week math used local-time getters,
    // a server west of UTC would resolve this to the previous day and bucket
    // the task into the wrong week.
    const midnight = getWeekRange(new Date("2026-06-22T00:00:00Z"));
    const lateEvening = getWeekRange(new Date("2026-06-22T23:59:59Z"));
    expect(toISODate(midnight.start)).toBe(toISODate(lateEvening.start));
    expect(toISODate(midnight.start)).toBe("2026-06-22");
  });
});

describe("getWeekInfo", () => {
  it("uses the ISO week-year, which can differ from the calendar year", () => {
    // 2027-01-01 is a Friday, so it falls in the ISO week that began
    // 2026-12-28 — week 53 of week-year 2026, not week 1 of 2027.
    // Progress snapshots are keyed on (weekNumber, year); getting this wrong
    // would collide two different weeks onto the same key.
    const { weekNumber, year } = getWeekInfo(new Date("2027-01-01T00:00:00Z"));
    expect(year).toBe(2026);
    expect(weekNumber).toBe(53);
  });

  it("gives every day of the same week an identical key", () => {
    const monday = getWeekInfo(new Date("2026-06-22T00:00:00Z"));
    const sunday = getWeekInfo(new Date("2026-06-28T00:00:00Z"));
    expect(sunday).toEqual(monday);
  });

  it("advances the week number across a week boundary", () => {
    const sunday = getWeekInfo(new Date("2026-06-28T00:00:00Z"));
    const nextMonday = getWeekInfo(new Date("2026-06-29T00:00:00Z"));
    expect(nextMonday.weekNumber).toBe(sunday.weekNumber + 1);
  });
});

describe("toISODate / fromISODate", () => {
  it("round-trips a date string", () => {
    expect(toISODate(fromISODate("2026-06-22"))).toBe("2026-06-22");
  });

  it("normalizes a mid-day timestamp to its UTC calendar day", () => {
    expect(toISODate(new Date("2026-06-22T18:30:00Z"))).toBe("2026-06-22");
  });
});

describe("eachDate", () => {
  it("is inclusive of both endpoints", () => {
    const dates = eachDate(
      new Date("2026-06-22T00:00:00Z"),
      new Date("2026-06-28T00:00:00Z")
    );
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-06-22");
    expect(dates[6]).toBe("2026-06-28");
  });

  it("returns a single date when start and end are the same day", () => {
    const dates = eachDate(
      new Date("2026-06-22T00:00:00Z"),
      new Date("2026-06-22T00:00:00Z")
    );
    expect(dates).toEqual(["2026-06-22"]);
  });

  it("crosses month boundaries", () => {
    const dates = eachDate(
      new Date("2026-06-29T00:00:00Z"),
      new Date("2026-07-02T00:00:00Z")
    );
    expect(dates).toEqual(["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02"]);
  });
});
