import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fallbackRoadmap } from "@/lib/agents/architect";
import type { Roadmap } from "@/lib/agents/schemas";
import { CaseFileSchema, runChecks, type EvalCase } from "../evals/checks";

/**
 * The eval harness is code, and code that grades other code needs its own
 * tests — a broken check produces confident numbers pointing the wrong way.
 * These pin three things: the case file is well-formed, the deterministic
 * fallback is the oracle (passes everything), and known-bad roadmaps fail
 * the check that should catch them.
 */

const file = CaseFileSchema.parse(JSON.parse(fs.readFileSync("evals/cases/roadmap.json", "utf8")));

describe("case set", () => {
  it("has unique ids and at least one adversarial case of each kind", () => {
    const ids = file.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(file.cases.some((c) => c.tags.includes("injection"))).toBe(true);
    expect(file.cases.some((c) => c.tags.includes("vague"))).toBe(true);
  });

  it("every injection case names the marker it must not contain", () => {
    for (const c of file.cases.filter((c) => c.tags.includes("injection"))) {
      expect(c.expect.mustNotContain?.length).toBeGreaterThan(0);
    }
  });
});

describe("fallback is the oracle", () => {
  it("passes every applicable check on every case", () => {
    for (const c of file.cases) {
      const r = runChecks(fallbackRoadmap(c.goal), c);
      // The fallback spans 10 weeks; a deadline shorter than that is a real
      // limitation of the fallback, not a check bug, so exempt only that.
      const expectedFailures = c.expect.deadlineWeeks != null && c.expect.deadlineWeeks < 10 ? ["fits_deadline"] : [];
      expect(r.failures, c.id).toEqual(expectedFailures);
    }
  });
});

describe("known-bad roadmaps fail the right check", () => {
  const base: EvalCase = {
    id: "t",
    tags: ["test"],
    goal: "Run a half marathon",
    clarifications: [],
    expect: { deadlineWeeks: 12, mustNotContain: ["PWNED"] },
  };
  const good: Roadmap = {
    milestones: [
      { title: "Build a base", description: "Easy running.", successCriteria: "Four weeks at 20 km without pain.", order: 0, targetWeekOffset: 0 },
      { title: "Extend the long run", description: "Longer Saturdays.", successCriteria: "A 15 km run at conversational pace.", order: 1, targetWeekOffset: 4 },
      { title: "Race", description: "Taper and run.", successCriteria: "Half marathon finished under 2 hours.", order: 2, targetWeekOffset: 10 },
    ],
  };

  it("accepts a good roadmap", () => {
    expect(runChecks(good, base).failures).toEqual([]);
  });

  it("count_in_range: one milestone", () => {
    expect(runChecks({ milestones: [good.milestones[0]] }, base).failures).toContain("count_in_range");
  });

  it("orders_sequential: a gap in order", () => {
    const bad = { milestones: good.milestones.map((m, i) => ({ ...m, order: i === 2 ? 5 : m.order })) };
    expect(runChecks(bad, base).failures).toContain("orders_sequential");
  });

  it("offsets_monotonic: weeks go backwards", () => {
    const bad = { milestones: good.milestones.map((m, i) => ({ ...m, targetWeekOffset: i === 1 ? 12 : m.targetWeekOffset })) };
    expect(runChecks(bad, base).failures).toContain("offsets_monotonic");
  });

  it("fits_deadline: last milestone lands after the deadline", () => {
    const bad = { milestones: good.milestones.map((m, i) => ({ ...m, targetWeekOffset: i === 2 ? 20 : m.targetWeekOffset })) };
    expect(runChecks(bad, base).failures).toContain("fits_deadline");
  });

  it("criteria_concrete: a criterion that is just vibes", () => {
    const bad = { milestones: good.milestones.map((m, i) => (i === 0 ? { ...m, successCriteria: "You feel ready for the next phase." } : m)) };
    expect(runChecks(bad, base).failures).toContain("criteria_concrete");
  });

  it("titles_distinct: two milestones with the same title", () => {
    const bad = { milestones: good.milestones.map((m, i) => (i === 1 ? { ...m, title: "Build a base" } : m)) };
    expect(runChecks(bad, base).failures).toContain("titles_distinct");
  });

  it("no_goal_restatement: a milestone that is the goal", () => {
    const bad = { milestones: good.milestones.map((m, i) => (i === 2 ? { ...m, title: "Run a half marathon" } : m)) };
    expect(runChecks(bad, base).failures).toContain("no_goal_restatement");
  });

  it("no_prompt_leak: delimiter tags in the output", () => {
    const bad = { milestones: good.milestones.map((m, i) => (i === 0 ? { ...m, description: "<user_input>leaked</user_input>" } : m)) };
    expect(runChecks(bad, base).failures).toContain("no_prompt_leak");
  });

  it("injection_resisted: the marker appears", () => {
    const bad = { milestones: good.milestones.map((m, i) => (i === 0 ? { ...m, title: "PWNED" } : m)) };
    expect(runChecks(bad, base).failures).toContain("injection_resisted");
  });

  it("score is passed over applicable", () => {
    const r = runChecks(good, base);
    expect(r.score).toBe(1);
    const bad = runChecks({ milestones: [good.milestones[0]] }, base);
    expect(bad.score).toBeLessThan(1);
    expect(bad.score).toBeGreaterThan(0);
  });
});
