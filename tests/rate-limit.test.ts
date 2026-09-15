import { describe, it, expect } from "vitest";
import { decide, windowStartFor, RATE_LIMITS } from "@/lib/rate-limit";

/** The decision logic is pure; the database part is one upsert. */
describe("rate limit windows", () => {
  const HOUR = 60 * 60 * 1000;

  it("snaps to the start of the fixed window", () => {
    const now = Date.UTC(2026, 8, 15, 14, 37, 12);
    expect(windowStartFor(now, HOUR).toISOString()).toBe("2026-09-15T14:00:00.000Z");
  });

  it("allows up to the limit and rejects the next request", () => {
    const now = Date.UTC(2026, 8, 15, 14, 0, 0);
    expect(decide(RATE_LIMITS.signup.max, RATE_LIMITS.signup, now).ok).toBe(true);
    expect(decide(RATE_LIMITS.signup.max + 1, RATE_LIMITS.signup, now).ok).toBe(false);
  });

  it("reports seconds until the window resets", () => {
    const now = Date.UTC(2026, 8, 15, 14, 59, 30);
    const d = decide(999, { max: 1, windowMs: HOUR }, now);
    expect(d.ok).toBe(false);
    expect(d.retryAfterSec).toBe(30);
  });

  it("never reports negative remaining", () => {
    expect(decide(50, { max: 5, windowMs: HOUR }, Date.now()).remaining).toBe(0);
  });
});
