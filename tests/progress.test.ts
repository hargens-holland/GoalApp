import { describe, it, expect } from "vitest";
import {
  fallbackAssessment,
  normalizeAssessment,
  type CompletionInput,
  type MilestoneInput,
} from "@/lib/agents/progress";
import type { ProgressAssessment } from "@/lib/agents/schemas";

const milestones: MilestoneInput[] = [
  { id: "ms-1", title: "Foundations", successCriteria: "Baseline set", order: 0, status: "done" },
  { id: "ms-2", title: "Build momentum", successCriteria: "4 weeks logged", order: 1, status: "active" },
  { id: "ms-3", title: "Consolidate", successCriteria: "Goal reached", order: 2, status: "locked" },
];

function assessment(overrides: Partial<ProgressAssessment> = {}): ProgressAssessment {
  return {
    currentMilestoneId: "ms-2",
    progressPercent: 50,
    summary: "Steady progress.",
    focusForWeek: "Keep the streak going.",
    completedMilestoneIds: ["ms-1"],
    ...overrides,
  };
}

/**
 * normalizeAssessment is the guard between model output and the database.
 * The schema proves progressPercent is a number and the ids are strings; it
 * cannot prove the number is in range or the ids exist. These are the cases
 * where a structurally-valid assessment would still write bad state.
 */
describe("normalizeAssessment", () => {
  it("leaves a sound assessment unchanged", () => {
    expect(normalizeAssessment(assessment(), milestones)).toEqual(assessment());
  });

  it.each([
    [150, 100],
    [-20, 0],
  ])("clamps an out-of-range percent (%i -> %i)", (input, expected) => {
    // Clamped rather than rejected: an out-of-range number still came with a
    // useful summary and focus, and discarding all of it would be worse.
    const result = normalizeAssessment(assessment({ progressPercent: input }), milestones);
    expect(result.progressPercent).toBe(expected);
  });

  it("rounds a fractional percent to an integer", () => {
    // Goal.progress is an Int column; a float would be silently truncated.
    const result = normalizeAssessment(assessment({ progressPercent: 42.7 }), milestones);
    expect(result.progressPercent).toBe(43);
  });

  it("nulls a currentMilestoneId that does not exist", () => {
    // A hallucinated id would otherwise be written as the goal's active
    // milestone and match nothing in the UI.
    const result = normalizeAssessment(
      assessment({ currentMilestoneId: "ms-invented" }),
      milestones
    );
    expect(result.currentMilestoneId).toBeNull();
  });

  it("strips unknown ids from completedMilestoneIds", () => {
    const result = normalizeAssessment(
      assessment({ completedMilestoneIds: ["ms-1", "ms-invented", "ms-2"] }),
      milestones
    );
    expect(result.completedMilestoneIds).toEqual(["ms-1", "ms-2"]);
  });
});

describe("fallbackAssessment", () => {
  const completions = (done: number, total: number): CompletionInput[] =>
    Array.from({ length: total }, (_, i) => ({
      title: `Task ${i + 1}`,
      completed: i < done,
      notes: null,
    }));

  it("reports low progress when little was completed", () => {
    const result = fallbackAssessment(milestones, completions(0, 6));
    expect(result.progressPercent).toBeLessThan(35);
    expect(result.currentMilestoneId).toBe("ms-1");
  });

  it("advances through the roadmap as completion rises", () => {
    const low = fallbackAssessment(milestones, completions(1, 6));
    const high = fallbackAssessment(milestones, completions(5, 6));
    expect(high.progressPercent).toBeGreaterThan(low.progressPercent);
  });

  it("never exceeds the last milestone", () => {
    const result = fallbackAssessment(milestones, completions(6, 6));
    expect(result.currentMilestoneId).toBe("ms-3");
    expect(result.progressPercent).toBeLessThanOrEqual(100);
  });

  it("handles a goal with no recorded tasks without dividing by zero", () => {
    const result = fallbackAssessment(milestones, []);
    expect(Number.isFinite(result.progressPercent)).toBe(true);
    expect(result.summary).toContain("0/");
  });

  it("produces output that survives normalization", () => {
    const result = fallbackAssessment(milestones, completions(3, 6));
    expect(normalizeAssessment(result, milestones)).toEqual(result);
  });
});
