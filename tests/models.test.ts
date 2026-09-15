import { describe, it, expect, afterEach } from "vitest";
import { DEFAULT_MODELS, modelFor } from "@/lib/agents/models";

describe("modelFor", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of ["ARCHITECT_MODEL", "PROGRESS_MODEL", "SCHEDULER_MODEL", "ANTHROPIC_MODEL"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("routes each agent to its default", () => {
    delete process.env.ANTHROPIC_MODEL;
    expect(modelFor("architect")).toBe(DEFAULT_MODELS.architect);
    expect(modelFor("scheduler")).toBe(DEFAULT_MODELS.scheduler);
  });

  it("lets one agent be overridden without touching the others", () => {
    delete process.env.ANTHROPIC_MODEL;
    process.env.SCHEDULER_MODEL = "claude-opus-5";
    expect(modelFor("scheduler")).toBe("claude-opus-5");
    expect(modelFor("progress")).toBe(DEFAULT_MODELS.progress);
  });

  it("a global override applies to every agent, but a per-agent one still wins", () => {
    process.env.ANTHROPIC_MODEL = "claude-sonnet-5";
    process.env.ARCHITECT_MODEL = "claude-opus-5";
    expect(modelFor("progress")).toBe("claude-sonnet-5");
    expect(modelFor("architect")).toBe("claude-opus-5");
  });
});
