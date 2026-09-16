import { describe, it, expect } from "vitest";
import { fallbackIntent, normalizeIntent, type CoordinatorContext } from "@/lib/agents/coordinator";
import { preview } from "@/lib/coordinator";
import type { Intent } from "@/lib/agents/schemas";

/**
 * The Coordinator is the first agent that reads free-form instructions and
 * causes writes, so its guard rails get tests of their own: the fallback
 * understands the phrasings the product suggests, normalization drops any id
 * that isn't the user's, and preview describes exactly what apply would do.
 */

const ctx: CoordinatorContext = {
  todayISO: "2026-09-16", // Wednesday
  weekStartISO: "2026-09-14",
  weekEndISO: "2026-09-20",
  goals: [
    { id: "g-run", title: "Run a half marathon", status: "active", activeMilestone: "Extend the long run", progress: 42 },
    { id: "g-guitar", title: "Learn fingerstyle guitar", status: "active", activeMilestone: "Clean chord transitions", progress: 36 },
    { id: "g-spanish", title: "Conversational Spanish", status: "active", activeMilestone: "Rebuild core vocabulary", progress: 14 },
  ],
  tasks: [
    { id: "t1", title: "Easy 5K", date: "2026-09-14", status: "done", goalId: "g-run" },
    { id: "t2", title: "Chord transition drills", date: "2026-09-16", status: "pending", goalId: "g-guitar" },
    { id: "t3", title: "Present-tense drills", date: "2026-09-16", status: "pending", goalId: "g-spanish" },
    { id: "t4", title: "Intervals 6×400 m", date: "2026-09-16", status: "pending", goalId: "g-run" },
    { id: "t5", title: "Long run 12K", date: "2026-09-19", status: "pending", goalId: "g-run" },
  ],
};

describe("fallbackIntent", () => {
  it("clears today when the user can't do today", () => {
    const i = fallbackIntent("can't do today, reschedule", ctx);
    expect(i.action).toBe("clear_day");
    expect(i.date).toBe("2026-09-16");
  });

  it("resolves a weekday name inside the current week", () => {
    const i = fallbackIntent("I'm busy on Saturday", ctx);
    expect(i.action).toBe("clear_day");
    expect(i.date).toBe("2026-09-19");
  });

  it("pauses a goal named by a word from its title", () => {
    const i = fallbackIntent("pause the guitar this week", ctx);
    expect(i.action).toBe("pause_goal");
    expect(i.goalId).toBe("g-guitar");
  });

  it("reviews a goal when asked how it is going", () => {
    const i = fallbackIntent("how am I doing on Spanish?", ctx);
    expect(i.action).toBe("review_goal");
    expect(i.goalId).toBe("g-spanish");
  });

  it("carries a roadmap change through as a revision request", () => {
    const i = fallbackIntent("I have half the time I thought for the marathon", ctx);
    expect(i.action).toBe("revise_roadmap");
    expect(i.goalId).toBe("g-run");
    expect(i.request).toContain("half the time");
  });

  it("replans the week", () => {
    expect(fallbackIntent("redo this week", ctx).action).toBe("replan_week");
  });

  it("says unclear rather than guessing", () => {
    const i = fallbackIntent("what's the weather like", ctx);
    expect(i.action).toBe("unclear");
    expect(i.message.length).toBeGreaterThan(10);
  });
});

describe("normalizeIntent", () => {
  const base: Intent = { action: "answer", date: null, goalId: null, taskId: null, request: null, message: "" };

  it("drops a goal id that is not the user's and asks instead", () => {
    const i = normalizeIntent({ ...base, action: "pause_goal", goalId: "someone-elses-goal" }, ctx);
    expect(i.action).toBe("unclear");
    expect(i.goalId).toBeNull();
  });

  it("drops a task id that is not in this week's context", () => {
    const i = normalizeIntent({ ...base, action: "skip_task", taskId: "t-unknown" }, ctx);
    expect(i.action).toBe("unclear");
  });

  it("refuses to clear a day outside the current week", () => {
    const i = normalizeIntent({ ...base, action: "clear_day", date: "2026-09-25" }, ctx);
    expect(i.action).toBe("unclear");
  });

  it("rejects a malformed date", () => {
    const i = normalizeIntent({ ...base, action: "clear_day", date: "tomorrow" }, ctx);
    expect(i.action).toBe("unclear");
  });

  it("needs a request for a roadmap revision", () => {
    const i = normalizeIntent({ ...base, action: "revise_roadmap", goalId: "g-run", request: "  " }, ctx);
    expect(i.action).toBe("unclear");
  });

  it("passes a well-formed intent through unchanged", () => {
    const good: Intent = { ...base, action: "clear_day", date: "2026-09-16", message: "ok" };
    expect(normalizeIntent(good, ctx)).toEqual(good);
  });
});

describe("preview", () => {
  const base: Intent = { action: "answer", date: null, goalId: null, taskId: null, request: null, message: "m" };

  it("names the tasks a cleared day will skip and the days that get re-laid", () => {
    const p = preview({ ...base, action: "clear_day", date: "2026-09-16" }, ctx);
    expect(p.actionable).toBe(true);
    expect(p.callsModel).toBe(true);
    expect(p.effects[0]).toContain("3 tasks");
    expect(p.effects[0]).toContain("Chord transition drills");
    expect(p.effects[1]).toContain("Thu 17");
    expect(p.effects[1]).toContain("Sun 20");
  });

  it("clearing the last day of the week has nowhere to move work to", () => {
    const p = preview({ ...base, action: "clear_day", date: "2026-09-20" }, ctx);
    expect(p.callsModel).toBe(false);
    expect(p.effects[1]).toMatch(/No days left/);
  });

  it("a status change does not call a model", () => {
    const p = preview({ ...base, action: "complete_task", taskId: "t2" }, ctx);
    expect(p.callsModel).toBe(false);
    expect(p.effects[0]).toContain("Chord transition drills");
  });

  it("answers and clarifications are not actionable", () => {
    expect(preview({ ...base, action: "answer" }, ctx).actionable).toBe(false);
    expect(preview({ ...base, action: "unclear" }, ctx).actionable).toBe(false);
  });
});
