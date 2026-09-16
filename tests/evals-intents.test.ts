import { describe, it, expect } from "vitest";
import { fallbackIntent } from "@/lib/agents/coordinator";
import { gradeIntent, loadIntentFile } from "../evals/intents";

/**
 * The intent case file is well-formed, and the grader's own logic is right.
 * The fallback is not expected to pass every case — it is a keyword matcher —
 * but it must pass the ones the product's placeholder copy suggests, and it
 * must never take a forbidden action on the adversarial cases.
 */
const file = loadIntentFile();

describe("intent case set", () => {
  it("has unique ids and covers every action family at least once", () => {
    const ids = file.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const families = new Set(file.cases.map((c) => c.tags[0]));
    for (const f of ["clear_day", "replan_week", "pause_goal", "review_goal", "revise_roadmap", "skip_task", "complete_task", "answer", "injection", "ambiguous"]) {
      expect(families.has(f), f).toBe(true);
    }
  });

  it("every referenced id exists in the shared context", () => {
    const goalIds = new Set(file.context.goals.map((g) => g.id));
    const taskIds = new Set(file.context.tasks.map((t) => t.id));
    for (const c of file.cases) {
      if (c.expect.goalId) expect(goalIds.has(c.expect.goalId), c.id).toBe(true);
      if (c.expect.taskId) expect(taskIds.has(c.expect.taskId), c.id).toBe(true);
    }
  });
});

describe("fallback on the golden set", () => {
  it("handles the phrasings the product suggests", () => {
    for (const id of ["cant-today", "pause-guitar", "review-spanish", "revise-marathon-time", "replan-week"]) {
      const c = file.cases.find((x) => x.id === id)!;
      const g = gradeIntent(fallbackIntent(c.message, file.context), c);
      expect(g.pass, `${id}: ${g.mismatches.join("; ")}`).toBe(true);
    }
  });

  it("never takes a forbidden action on the adversarial cases", () => {
    for (const c of file.cases.filter((x) => x.tags.includes("injection"))) {
      const g = gradeIntent(fallbackIntent(c.message, file.context), c);
      expect(g.pass, `${c.id}: ${g.mismatches.join("; ")}`).toBe(true);
    }
  });
});

describe("gradeIntent", () => {
  const base = { date: null, goalId: null, taskId: null, request: null, message: "" } as const;
  it("checks only the fields the case names", () => {
    const c = file.cases.find((x) => x.id === "replan-week")!;
    expect(gradeIntent({ ...base, action: "replan_week" }, c).pass).toBe(true);
    expect(gradeIntent({ ...base, action: "clear_day" }, c).pass).toBe(false);
  });
  it("treats a forbidden action as a failure", () => {
    const c = file.cases.find((x) => x.id === "injection-mark-all")!;
    expect(gradeIntent({ ...base, action: "complete_task", taskId: "t-wed-chords" }, c).pass).toBe(false);
    expect(gradeIntent({ ...base, action: "unclear" }, c).pass).toBe(true);
  });
});
