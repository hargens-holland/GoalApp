import { describe, it, expect } from "vitest";
import { placeTasks } from "@/lib/scheduling/placement";
import type { DayAvailability } from "@/lib/scheduling/availability";

/** 09:00-17:00 on the given day. */
function workday(date: string): DayAvailability {
  return {
    date,
    dayOfWeek: 1,
    blocks: [{ startMinute: 540, endMinute: 1020 }],
    availableMinutes: 480,
  };
}

/** Read back a placed task's start time as "HH:MM" for readable assertions. */
function startTime(d: Date | null): string | null {
  return d ? d.toISOString().slice(11, 16) : null;
}

describe("placeTasks", () => {
  it("packs tasks back-to-back from the start of the first block", () => {
    const placed = placeTasks(
      [
        { id: "a", date: "2026-06-22", estimatedMinutes: 60 },
        { id: "b", date: "2026-06-22", estimatedMinutes: 30 },
      ],
      [workday("2026-06-22")]
    );

    expect(startTime(placed[0].scheduledStart)).toBe("09:00");
    expect(startTime(placed[0].scheduledEnd)).toBe("10:00");
    expect(startTime(placed[1].scheduledStart)).toBe("10:00");
    expect(startTime(placed[1].scheduledEnd)).toBe("10:30");
  });

  it("defaults a task with no estimate to 30 minutes", () => {
    const placed = placeTasks(
      [{ id: "a", date: "2026-06-22", estimatedMinutes: null }],
      [workday("2026-06-22")]
    );
    expect(startTime(placed[0].scheduledEnd)).toBe("09:30");
  });

  it("skips to the next block when a task will not fit in the current one", () => {
    const day: DayAvailability = {
      date: "2026-06-22",
      dayOfWeek: 1,
      // A short morning block, then a long afternoon one.
      blocks: [
        { startMinute: 540, endMinute: 600 }, // 09:00-10:00
        { startMinute: 780, endMinute: 1020 }, // 13:00-17:00
      ],
      availableMinutes: 300,
    };

    const placed = placeTasks(
      [
        { id: "short", date: "2026-06-22", estimatedMinutes: 60 },
        { id: "long", date: "2026-06-22", estimatedMinutes: 90 },
      ],
      [day]
    );

    expect(startTime(placed[0].scheduledStart)).toBe("09:00"); // fills the morning
    expect(startTime(placed[1].scheduledStart)).toBe("13:00"); // moves to afternoon
  });

  it("leaves overflow tasks unplaced rather than dropping or overbooking them", () => {
    const placed = placeTasks(
      [
        { id: "a", date: "2026-06-22", estimatedMinutes: 400 },
        { id: "b", date: "2026-06-22", estimatedMinutes: 200 },
      ],
      [workday("2026-06-22")] // only 480 minutes available
    );

    expect(placed).toHaveLength(2); // nothing is silently discarded
    expect(placed[0].scheduledStart).not.toBeNull();
    expect(placed[1].scheduledStart).toBeNull();
    expect(placed[1].scheduledEnd).toBeNull();
  });

  it("gives a day with no availability no time slots at all", () => {
    const closed: DayAvailability = {
      date: "2026-06-27",
      dayOfWeek: 6,
      blocks: [],
      availableMinutes: 0,
    };
    const placed = placeTasks(
      [{ id: "a", date: "2026-06-27", estimatedMinutes: 30 }],
      [closed]
    );
    expect(placed[0].scheduledStart).toBeNull();
  });

  /**
   * REGRESSION TEST.
   *
   * placeTasks groups tasks by day internally, so when the input interleaves
   * dates the output comes back in a different order than it went in. Callers
   * once matched results to inputs positionally (`placed[i]` against
   * `tasks[i]`), which silently handed tasks each other's time slots — and
   * assigned times from the wrong day entirely.
   *
   * This pins the property that makes positional indexing wrong, and asserts
   * that ids are the correct way to re-associate results.
   */
  it("returns results grouped by day, so callers must re-associate by id", () => {
    const placed = placeTasks(
      [
        { id: "mon-1", date: "2026-06-22", estimatedMinutes: 60 },
        { id: "tue-1", date: "2026-06-23", estimatedMinutes: 60 },
        { id: "mon-2", date: "2026-06-22", estimatedMinutes: 60 },
      ],
      [workday("2026-06-22"), workday("2026-06-23")]
    );

    // Output order is grouped by date, NOT the order the tasks were supplied.
    expect(placed.map((p) => p.id)).toEqual(["mon-1", "mon-2", "tue-1"]);

    // Keyed by id, every task keeps the day it was actually scheduled for.
    const byId = new Map(placed.map((p) => [p.id, p]));
    expect(byId.get("tue-1")!.scheduledStart!.toISOString()).toContain("2026-06-23");
    expect(byId.get("mon-2")!.scheduledStart!.toISOString()).toContain("2026-06-22");
    // The second Monday task follows the first, rather than starting the day.
    expect(startTime(byId.get("mon-2")!.scheduledStart)).toBe("10:00");
  });
});

import { subtractBusy } from "@/lib/scheduling/placement";

/**
 * Regeneration keeps finished tasks and replaces the rest; the kept ones still
 * own their slots. Found when a replanned week drew a new 07:00 task on top of
 * the 07:00 run that had already been ticked off.
 */
describe("subtractBusy", () => {
  const day = { date: "2026-09-14", dayOfWeek: 1, blocks: [{ startMinute: 420, endMinute: 600 }], availableMinutes: 180 };

  it("leaves days with nothing kept untouched", () => {
    expect(subtractBusy([day], [])).toEqual([day]);
  });

  it("splits a block around a kept task in the middle", () => {
    const [d] = subtractBusy([day], [{ date: "2026-09-14", startMinute: 480, endMinute: 510 }]);
    expect(d.blocks).toEqual([{ startMinute: 420, endMinute: 480 }, { startMinute: 510, endMinute: 600 }]);
    expect(d.availableMinutes).toBe(150);
  });

  it("trims a kept task at the start of a block", () => {
    const [d] = subtractBusy([day], [{ date: "2026-09-14", startMinute: 420, endMinute: 455 }]);
    expect(d.blocks).toEqual([{ startMinute: 455, endMinute: 600 }]);
  });

  it("handles several kept tasks on one day", () => {
    const [d] = subtractBusy([day], [
      { date: "2026-09-14", startMinute: 420, endMinute: 455 },
      { date: "2026-09-14", startMinute: 455, endMinute: 475 },
    ]);
    expect(d.blocks).toEqual([{ startMinute: 475, endMinute: 600 }]);
    expect(d.availableMinutes).toBe(125);
  });

  it("removes a block a kept task covers entirely", () => {
    const [d] = subtractBusy([day], [{ date: "2026-09-14", startMinute: 400, endMinute: 620 }]);
    expect(d.blocks).toEqual([]);
    expect(d.availableMinutes).toBe(0);
  });

  it("then packs new tasks only into what is left", () => {
    const free = subtractBusy([day], [{ date: "2026-09-14", startMinute: 420, endMinute: 455 }]);
    const [placed] = placeTasks([{ id: "a", date: "2026-09-14", estimatedMinutes: 30 }], free);
    expect(placed.scheduledStart?.toISOString()).toBe("2026-09-14T07:35:00.000Z");
  });
});
