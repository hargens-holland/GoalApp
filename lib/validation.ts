import { NextResponse } from "next/server";
import { z } from "zod";
import { IntentSchema } from "@/lib/agents/schemas";

/**
 * Request-body contracts for every API route.
 *
 * Two jobs. The obvious one is rejecting malformed input with a 400 instead of
 * a 500 or a silently wrong write. The less obvious one is **bounding what can
 * reach a prompt**: goal text, clarifying answers, task notes, and revision
 * requests all end up inside a model call, so their length is a cost ceiling
 * and their shape is part of the prompt-injection surface. Every string that
 * can reach the model has an explicit maximum here.
 *
 * Limits are exported so the UI can enforce the same numbers client-side.
 */

export const LIMITS = {
  goal: 500,
  question: 300,
  answer: 500,
  clarifications: 5,
  notes: 2000,
  request: 1000,
  title: 120,
  name: 80,
  email: 254,
  passwordMin: 10,
  passwordMax: 128,
  weekOffset: 52,
  assistantMessage: 500,
} as const;

const trimmed = (max: number, min = 0) => z.string().trim().min(min).max(max);

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

export const ClarificationSchema = z.object({
  question: trimmed(LIMITS.question),
  answer: trimmed(LIMITS.answer),
});

export const CreateGoalBody = z.object({
  goal: trimmed(LIMITS.goal, 4),
  clarifications: z.array(ClarificationSchema).max(LIMITS.clarifications).default([]),
});

export const ClarifyBody = z.object({
  goal: trimmed(LIMITS.goal, 4),
});

export const AdjustGoalBody = z.object({
  scope: z.enum(["roadmap", "week"]).default("week"),
  request: trimmed(LIMITS.request).optional(),
});

export const PatchGoalBody = z.object({
  title: trimmed(LIMITS.title, 1).optional(),
  goal: trimmed(LIMITS.goal, 4).optional(),
  status: z.enum(["active", "paused", "done"]).optional(),
});

export const PatchTaskBody = z.object({
  completed: z.boolean().optional(),
  status: z.enum(["pending", "done", "skipped"]).optional(),
  notes: z.string().max(LIMITS.notes).nullable().optional(),
  // Free-form client metadata. Bounded by serialized size rather than shape.
  metadata: z
    .unknown()
    .refine((v) => v === undefined || JSON.stringify(v).length <= 4_000, "metadata too large")
    .optional(),
});

export const AvailabilityWindowSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(0).max(1440),
  })
  .refine((w) => w.endMinute > w.startMinute, "endMinute must be after startMinute");

export const PutAvailabilityBody = z.object({
  // Two windows per day at most; the form only produces one.
  windows: z.array(AvailabilityWindowSchema).max(14).default([]),
});

export const ScheduleBody = z.object({
  weekOffset: z.number().int().min(-LIMITS.weekOffset).max(LIMITS.weekOffset).default(0),
});

export const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: trimmed(LIMITS.assistantMessage * 2, 1),
});

export const AssistantBody = z.object({
  message: trimmed(LIMITS.assistantMessage, 2),
  // The recent transcript, oldest first, so follow-ups resolve. Capped so a
  // client cannot ship a novel as context.
  history: z.array(ChatTurnSchema).max(10).default([]),
});

export const AssistantApplyBody = z.object({
  intent: IntentSchema,
});

export const SignupBody = z.object({
  // Normalize first, then check the format — zod runs checks in order.
  email: z.string().trim().toLowerCase().max(LIMITS.email).pipe(z.email()),
  password: z
    .string()
    .min(LIMITS.passwordMin, `Password must be at least ${LIMITS.passwordMin} characters`)
    .max(LIMITS.passwordMax),
  name: trimmed(LIMITS.name).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/**
 * Parse and validate a JSON body. On failure, the caller returns `response`
 * directly: a 400 with the first problem in plain words, and the full field
 * list for clients that want it.
 */
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<Parsed<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Body must be JSON" }, { status: 400 }) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join(".");
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: path ? `${path}: ${first.message}` : first?.message ?? "Invalid request",
          issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: result.data };
}

/** Parse a single integer query parameter with bounds; invalid falls back. */
export function intParam(url: string, name: string, fallback: number, min: number, max: number): number {
  const raw = new URL(url).searchParams.get(name);
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}
