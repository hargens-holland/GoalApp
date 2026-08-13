import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fallbackRoadmap, generateRoadmap } from "@/lib/agents/architect";
import { isDemoMode } from "@/lib/agents/client";
import {
  ProgressAssessmentSchema,
  RoadmapSchema,
  ScheduleSchema,
} from "@/lib/agents/schemas";
import { fallbackAssessment } from "@/lib/agents/progress";
import { fallbackSchedule } from "@/lib/agents/scheduler";

/**
 * The schemas are the contract between the model and the database. These tests
 * cover both directions: that the schemas actually reject bad output, and that
 * the deterministic fallbacks satisfy the same contract the model is held to.
 *
 * The second half matters more than it looks. The fallbacks run in demo mode —
 * which is how the public deployment runs full time — so if a fallback drifted
 * out of contract, the demo would be the one path nothing validated.
 */

describe("output schemas", () => {
  it("rejects a roadmap with no milestones", () => {
    // Nothing downstream can run without at least one milestone, so this is
    // the one case worth failing an entire response over.
    expect(RoadmapSchema.safeParse({ milestones: [] }).success).toBe(false);
  });

  it("rejects a milestone missing its success criteria", () => {
    const result = RoadmapSchema.safeParse({
      milestones: [
        { title: "Phase 1", description: "Do the thing", order: 0, targetWeekOffset: 0 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer milestone order", () => {
    const result = RoadmapSchema.safeParse({
      milestones: [
        {
          title: "Phase 1",
          description: "Do the thing",
          successCriteria: "Done",
          order: 1.5,
          targetWeekOffset: 0,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an empty schedule, which is a legitimate result", () => {
    // A week with no availability should produce no tasks — that is not an error.
    expect(ScheduleSchema.safeParse({ tasks: [] }).success).toBe(true);
  });

  it("requires a progress assessment to carry a numeric percent", () => {
    const result = ProgressAssessmentSchema.safeParse({
      currentMilestoneId: null,
      progressPercent: "half",
      summary: "s",
      focusForWeek: "f",
      completedMilestoneIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("allows a null currentMilestoneId", () => {
    const result = ProgressAssessmentSchema.safeParse({
      currentMilestoneId: null,
      progressPercent: 0,
      summary: "Not started.",
      focusForWeek: "Pick a first task.",
      completedMilestoneIds: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("deterministic fallbacks satisfy the model's contract", () => {
  it("fallbackRoadmap validates against RoadmapSchema", () => {
    expect(RoadmapSchema.safeParse(fallbackRoadmap("Run a half marathon")).success).toBe(
      true
    );
  });

  it("fallbackRoadmap orders milestones sequentially from zero", () => {
    const { milestones } = fallbackRoadmap("Learn guitar");
    expect(milestones.map((m) => m.order)).toEqual([0, 1, 2, 3]);
  });

  it("fallbackAssessment validates against ProgressAssessmentSchema", () => {
    const result = fallbackAssessment(
      [{ id: "ms-1", title: "Foundations", successCriteria: null, order: 0, status: "active" }],
      [{ title: "Task", completed: true, notes: null }]
    );
    expect(ProgressAssessmentSchema.safeParse(result).success).toBe(true);
  });

  it("fallbackSchedule validates against ScheduleSchema", () => {
    const result = fallbackSchedule(
      [
        {
          id: "goal-1",
          title: "Run a half marathon",
          focusForWeek: "Base building",
          currentMilestoneId: "ms-1",
          currentMilestoneTitle: "Base",
        },
      ],
      [{ date: "2026-06-22", availableMinutes: 480 }]
    );
    expect(ScheduleSchema.safeParse(result).success).toBe(true);
  });
});

describe("demo mode", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalFlag = process.env.DEMO_MODE;

  beforeEach(() => {
    // Keep the deliberate log lines out of the test output.
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    process.env.DEMO_MODE = originalFlag;
    vi.restoreAllMocks();
  });

  it("is on when no API key is configured", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.DEMO_MODE = "false";
    expect(isDemoMode()).toBe(true);
  });

  it("treats a blank API key as unset", () => {
    process.env.ANTHROPIC_API_KEY = "   ";
    process.env.DEMO_MODE = "false";
    expect(isDemoMode()).toBe(true);
  });

  it("stays on when DEMO_MODE is set even though a key is present", () => {
    // This is what protects the public deployment: a key present in the
    // environment must still never be spent by an anonymous visitor.
    process.env.ANTHROPIC_API_KEY = "sk-ant-not-a-real-key";
    process.env.DEMO_MODE = "true";
    expect(isDemoMode()).toBe(true);
  });

  it("is off when a real key is present and the flag is not set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-not-a-real-key";
    process.env.DEMO_MODE = "false";
    expect(isDemoMode()).toBe(false);
  });

  it("returns a complete roadmap without making any network call", async () => {
    process.env.DEMO_MODE = "true";
    // No API mocking anywhere: if this touched the network it would fail.
    const outcome = await generateRoadmap("Run a half marathon", []);

    expect(outcome.source).toBe("fallback");
    expect(outcome.reason).toBe("demo_mode");
    expect(outcome.attempts).toBe(0);
    expect(RoadmapSchema.safeParse(outcome.data).success).toBe(true);
  });
});
