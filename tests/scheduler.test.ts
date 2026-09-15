import { describe, it, expect } from "vitest";
import {
  fallbackSchedule,
  keepValidTasks,
  type DayCapacity,
  type SchedulerGoalInput,
} from "@/lib/agents/scheduler";
import type { GeneratedDailyTask } from "@/lib/agents/schemas";

const goals: SchedulerGoalInput[] = [
  {
    id: "goal-1",
    title: "Run a half marathon",
    focusForWeek: "Build the long-run base",
    currentMilestoneId: "ms-1",
    currentMilestoneTitle: "Base building",
  },
  {
    id: "goal-2",
    title: "Learn fingerstyle guitar",
    focusForWeek: "Clean chord transitions",
    currentMilestoneId: "ms-2",
    currentMilestoneTitle: "Chord transitions",
  },
];

const days: DayCapacity[] = [
  { date: "2026-06-22", availableMinutes: 480 },
  { date: "2026-06-23", availableMinutes: 480 },
  { date: "2026-06-27", availableMinutes: 0 }, // weekend, unavailable
];

function task(overrides: Partial<GeneratedDailyTask> = {}): GeneratedDailyTask {
  return {
    goalId: "goal-1",
    milestoneId: "ms-1",
    title: "Easy 5K",
    description: "Conversational pace.",
    date: "2026-06-22",
    estimatedMinutes: 45,
    ...overrides,
  };
}

/**
 * keepValidTasks is the semantic half of output validation. The JSON schema
 * guarantees each task is *shaped* right; only this can check that the ids and
 * dates refer to things we actually asked about. Everything here is a case
 * where a structurally-valid response would still corrupt data if written.
 */
describe("keepValidTasks", () => {
  it("keeps a well-formed task untouched", () => {
    expect(keepValidTasks([task()], goals, days)).toHaveLength(1);
  });

  it("drops tasks referencing a goal the user does not own", () => {
    // Would otherwise violate a foreign key, or worse, attach to another user.
    const result = keepValidTasks([task({ goalId: "goal-does-not-exist" })], goals, days);
    expect(result).toEqual([]);
  });

  it("drops tasks dated outside the requested range", () => {
    // Would silently write into a week the user was not looking at.
    const result = keepValidTasks([task({ date: "2026-08-01" })], goals, days);
    expect(result).toEqual([]);
  });

  it("drops tasks dated on a day with no availability", () => {
    // 2026-06-27 is listed but has zero capacity. The Availability page
    // promises tasks only land inside the user's windows; a task here would
    // reach the packer with nowhere to go.
    const result = keepValidTasks([task({ date: "2026-06-27" })], goals, days);
    expect(result).toHaveLength(0);
  });

  it("replaces a milestone id belonging to a different goal", () => {
    // ms-2 belongs to goal-2, so attaching it to goal-1 is a cross-goal
    // reference; it is corrected to goal-1's own current milestone.
    const [result] = keepValidTasks(
      [task({ goalId: "goal-1", milestoneId: "ms-2" })],
      goals,
      days
    );
    expect(result.milestoneId).toBe("ms-1");
  });

  it.each([
    ["zero", 0],
    ["negative", -30],
  ])("replaces a %s duration with a sane default", (_label, minutes) => {
    // A zero-width task would be placed with identical start and end times.
    const [result] = keepValidTasks([task({ estimatedMinutes: minutes })], goals, days);
    expect(result.estimatedMinutes).toBe(30);
  });

  it("caps an implausibly long duration", () => {
    const [result] = keepValidTasks([task({ estimatedMinutes: 100_000 })], goals, days);
    expect(result.estimatedMinutes).toBe(8 * 60);
  });

  it("filters a mixed batch down to only the usable tasks", () => {
    const result = keepValidTasks(
      [task(), task({ goalId: "nope" }), task({ date: "2030-01-01" }), task({ goalId: "goal-2", milestoneId: "ms-2" })],
      goals,
      days
    );
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.goalId)).toEqual(["goal-1", "goal-2"]);
  });
});

describe("fallbackSchedule", () => {
  it("produces a usable plan for every goal", () => {
    const { tasks } = fallbackSchedule(goals, days);
    expect(tasks.length).toBe(goals.length * 3);
    expect(new Set(tasks.map((t) => t.goalId))).toEqual(new Set(["goal-1", "goal-2"]));
  });

  it("never schedules onto a day with no availability", () => {
    const { tasks } = fallbackSchedule(goals, days);
    expect(tasks.some((t) => t.date === "2026-06-27")).toBe(false);
  });

  it("spreads work across days instead of stacking one day", () => {
    const { tasks } = fallbackSchedule(goals, days);
    const usedDays = new Set(tasks.map((t) => t.date));
    expect(usedDays.size).toBeGreaterThan(1);
  });

  it("returns nothing when there is no capacity at all", () => {
    const { tasks } = fallbackSchedule(goals, [
      { date: "2026-06-22", availableMinutes: 0 },
    ]);
    expect(tasks).toEqual([]);
  });

  it("returns nothing when there are no goals", () => {
    expect(fallbackSchedule([], days).tasks).toEqual([]);
  });

  it("titles tasks from the current milestone, not the goal", () => {
    // The milestone is the more actionable subject, and the public demo runs
    // on this planner permanently — so its output has to read plausibly.
    const { tasks } = fallbackSchedule([goals[1]], days);
    expect(tasks.every((t) => t.title.includes("Chord transitions"))).toBe(true);
    // Framings vary so a week isn't three identical rows.
    expect(new Set(tasks.map((t) => t.title)).size).toBe(tasks.length);
  });

  it("falls back to the goal title when there is no active milestone", () => {
    const goalWithoutMilestone: SchedulerGoalInput = {
      ...goals[0],
      currentMilestoneId: null,
      currentMilestoneTitle: null,
    };
    const { tasks } = fallbackSchedule([goalWithoutMilestone], days);
    expect(tasks.every((t) => t.title.includes("Run a half marathon"))).toBe(true);
  });

  it("never proposes a session longer than the day can hold", () => {
    const { tasks } = fallbackSchedule(goals, [
      { date: "2026-06-22", availableMinutes: 30 },
    ]);
    expect(tasks.every((t) => t.estimatedMinutes <= 30)).toBe(true);
  });

  it("produces output that survives its own validation", () => {
    // The fallback runs in demo mode, so it must satisfy the same guarantees
    // as model output — otherwise the demo could write invalid rows.
    const { tasks } = fallbackSchedule(goals, days);
    expect(keepValidTasks(tasks, goals, days)).toHaveLength(tasks.length);
  });
});
