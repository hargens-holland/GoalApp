import { describe, it, expect } from "vitest";
import {
  CreateGoalBody,
  LIMITS,
  PatchTaskBody,
  PutAvailabilityBody,
  ScheduleBody,
  SignupBody,
  intParam,
  parseBody,
} from "@/lib/validation";

/**
 * Every string that can reach a prompt has a maximum length. These pin the
 * limits and the failure shape (400 with a readable message), which the UI
 * mirrors client-side.
 */
describe("request bodies", () => {
  it("accepts a well-formed goal and trims it", () => {
    const r = CreateGoalBody.safeParse({ goal: "  Run a half marathon  ", clarifications: [] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.goal).toBe("Run a half marathon");
  });

  it("rejects goal text over the limit", () => {
    const r = CreateGoalBody.safeParse({ goal: "x".repeat(LIMITS.goal + 1) });
    expect(r.success).toBe(false);
  });

  it("rejects more clarifications than the prompt is sized for", () => {
    const many = Array.from({ length: LIMITS.clarifications + 1 }, () => ({ question: "q", answer: "a" }));
    expect(CreateGoalBody.safeParse({ goal: "Learn Spanish", clarifications: many }).success).toBe(false);
  });

  it("caps task notes", () => {
    expect(PatchTaskBody.safeParse({ notes: "n".repeat(LIMITS.notes) }).success).toBe(true);
    expect(PatchTaskBody.safeParse({ notes: "n".repeat(LIMITS.notes + 1) }).success).toBe(false);
  });

  it("only allows known task statuses", () => {
    expect(PatchTaskBody.safeParse({ status: "done" }).success).toBe(true);
    expect(PatchTaskBody.safeParse({ status: "finished" }).success).toBe(false);
  });

  it("rejects an availability window that ends before it starts", () => {
    const r = PutAvailabilityBody.safeParse({ windows: [{ dayOfWeek: 1, startMinute: 600, endMinute: 540 }] });
    expect(r.success).toBe(false);
  });

  it("bounds the week offset so a client cannot page a year of history per request", () => {
    expect(ScheduleBody.safeParse({ weekOffset: LIMITS.weekOffset }).success).toBe(true);
    expect(ScheduleBody.safeParse({ weekOffset: LIMITS.weekOffset + 1 }).success).toBe(false);
    expect(ScheduleBody.safeParse({ weekOffset: 1.5 }).success).toBe(false);
  });

  it("requires a real email and a ten-character password", () => {
    expect(SignupBody.safeParse({ email: "not-an-email", password: "longenough1" }).success).toBe(false);
    expect(SignupBody.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
    const ok = SignupBody.safeParse({ email: "  A@B.CO ", password: "longenough1" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.email).toBe("a@b.co");
  });
});

describe("parseBody", () => {
  function req(body: unknown, raw = false) {
    return new Request("http://x/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw ? (body as string) : JSON.stringify(body),
    });
  }

  it("returns typed data on success", async () => {
    const r = await parseBody(req({ weekOffset: 2 }), ScheduleBody);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.weekOffset).toBe(2);
  });

  it("returns a 400 naming the field on failure", async () => {
    const r = await parseBody(req({ goal: "hi" }), CreateGoalBody);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      const json = await r.response.json();
      expect(json.error).toMatch(/^goal:/);
    }
  });

  it("returns a 400 for a body that is not JSON", async () => {
    const r = await parseBody(req("not json", true), ScheduleBody);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });
});

describe("intParam", () => {
  it("falls back for missing, non-integer, or out-of-range values", () => {
    expect(intParam("http://x/?weekOffset=3", "weekOffset", 0, -52, 52)).toBe(3);
    expect(intParam("http://x/", "weekOffset", 0, -52, 52)).toBe(0);
    expect(intParam("http://x/?weekOffset=abc", "weekOffset", 0, -52, 52)).toBe(0);
    expect(intParam("http://x/?weekOffset=999", "weekOffset", 0, -52, 52)).toBe(0);
    expect(intParam("http://x/?weekOffset=1.5", "weekOffset", 0, -52, 52)).toBe(0);
  });
});
