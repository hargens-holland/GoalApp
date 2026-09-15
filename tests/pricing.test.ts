import { describe, it, expect } from "vitest";
import { estimateCost, formatUsd, PRICES } from "@/lib/agents/pricing";

/**
 * Cost estimates feed the usage page and, later, per-user budgets. They need
 * to be right to the token, and they need to be *conservative* for a model we
 * haven't priced rather than silently zero.
 */
describe("estimateCost", () => {
  it("prices a plain call at input + output list price", () => {
    const usd = estimateCost("claude-sonnet-5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(usd).toBeCloseTo(PRICES["claude-sonnet-5"].input + PRICES["claude-sonnet-5"].output, 6);
  });

  it("bills cache reads at a tenth of input and writes at 1.25×", () => {
    const usd = estimateCost("claude-opus-5", {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    });
    const input = PRICES["claude-opus-5"].input;
    expect(usd).toBeCloseTo(input * 0.1 + input * 1.25, 6);
  });

  it("errs high for an unknown model instead of reporting zero", () => {
    const known = estimateCost("claude-opus-5", { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 });
    const unknown = estimateCost("claude-mystery-9", { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(unknown).toBe(known);
    expect(unknown).toBeGreaterThan(0);
  });

  it("is zero for zero tokens", () => {
    expect(estimateCost("claude-opus-5", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(0);
  });
});

describe("formatUsd", () => {
  it("shows more precision for sub-cent amounts", () => {
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(0.42)).toBe("$0.420");
    expect(formatUsd(4.2)).toBe("$4.20");
    expect(formatUsd(0)).toBe("$0");
  });
});
