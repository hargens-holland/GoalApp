import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDemoMode } from "@/lib/agents/client";

/**
 * Rate limiting.
 *
 * Two things need protecting. Signup, because an open signup form plus a live
 * API key is an invitation to create accounts in a loop. And every route that
 * calls a model, because each call costs real money and a single user in a
 * `while(true)` could spend the month's budget in an hour.
 *
 * Fixed windows, counted in Postgres: one upsert per request, atomic
 * increment, keyed on (scope:identity, window start). It is deliberately
 * simple. Sliding windows and token buckets are better; they also need Redis,
 * and at this scale a database round-trip the request was already going to
 * make is the right trade. The seam is `check()` — a Redis implementation
 * returns the same shape.
 *
 * Fails open: if the database is unreachable the request proceeds and a
 * warning is logged. A rate limiter that takes the app down with it is worse
 * than a brief window of no limiting.
 */

export interface Limit {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
}

const HOUR = 60 * 60 * 1000;

export const RATE_LIMITS = {
  /** New accounts per IP. */
  signup: { max: 5, windowMs: HOUR } satisfies Limit,
  /** Model-calling requests per user (goal creation, clarify, review, adjust, replan). */
  agent: { max: 40, windowMs: HOUR } satisfies Limit,
} as const;

export interface Decision {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfterSec: number;
}

/** Start of the fixed window containing `now`. Exported for tests. */
export function windowStartFor(now: number, windowMs: number): Date {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

/** Pure decision from a count that already includes this request. */
export function decide(count: number, limit: Limit, now: number): Decision {
  const start = windowStartFor(now, limit.windowMs).getTime();
  return {
    ok: count <= limit.max,
    remaining: Math.max(0, limit.max - count),
    retryAfterSec: Math.max(1, Math.ceil((start + limit.windowMs - now) / 1000)),
  };
}

export async function check(key: string, limit: Limit): Promise<Decision> {
  const now = Date.now();
  const windowStart = windowStartFor(now, limit.windowMs);
  try {
    const row = await prisma.rateLimit.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
    });

    // Opportunistic cleanup: roughly one request in fifty sweeps windows that
    // ended more than two windows ago. Cheap, and keeps the table bounded
    // without a scheduled job.
    if (Math.random() < 0.02) {
      const cutoff = new Date(now - 2 * limit.windowMs);
      void prisma.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } }).catch(() => {});
    }

    return decide(row.count, limit, now);
  } catch (error) {
    console.warn("[rate-limit] check failed, allowing request:", error instanceof Error ? error.message : error);
    return { ok: true, remaining: limit.max, retryAfterSec: 0 };
  }
}

/** Best-effort client address behind a proxy or CDN. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function tooMany(decision: Decision, what: string): NextResponse {
  return NextResponse.json(
    { error: `Too many ${what}. Try again in ${Math.ceil(decision.retryAfterSec / 60)} minute${decision.retryAfterSec > 90 ? "s" : ""}.` },
    { status: 429, headers: { "Retry-After": String(decision.retryAfterSec) } }
  );
}

/** Returns a 429 response to send, or null to proceed. */
export async function limitSignup(request: Request): Promise<NextResponse | null> {
  const d = await check(`signup:ip:${clientIp(request)}`, RATE_LIMITS.signup);
  return d.ok ? null : tooMany(d, "signups from this address");
}

/**
 * Returns a 429 response to send, or null to proceed.
 *
 * Skipped in demo mode: no model is called, so there is no cost to protect,
 * and the demo account is shared by every visitor — a per-user limit there
 * would throttle strangers for each other's clicks.
 */
export async function limitAgentCall(userId: string): Promise<NextResponse | null> {
  if (isDemoMode()) return null;
  const d = await check(`agent:user:${userId}`, RATE_LIMITS.agent);
  return d.ok ? null : tooMany(d, "planning requests");
}
