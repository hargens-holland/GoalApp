import { generate, type AgentOutcome } from "./client";
import { UNTRUSTED_NOTICE, untrusted } from "./prompt";
import { modelFor } from "./models";

/** Per-call options shared by the Architect's entry points. */
export interface ArchitectOptions {
  userId?: string;
  /** Override the configured model, e.g. from an eval run. */
  model?: string;
}
import {
  ClarifyingQuestionsSchema,
  RoadmapSchema,
  type Clarification,
  type Roadmap,
} from "./schemas";

/**
 * ARCHITECT AGENT
 *
 * Turns a goal into a durable roadmap of milestones. Runs rarely — at goal
 * creation, or on an explicit re-plan. It deliberately does not produce
 * day-to-day tasks; that is the Scheduler's job. Its output is the stable
 * structure everything else hangs off, which is why it is the only agent whose
 * failure mode is worth a hard schema requirement (see RoadmapSchema).
 */

// ---------------------------------------------------------------------------
// Deterministic fallbacks
// ---------------------------------------------------------------------------

/**
 * A generic but coherent four-phase roadmap.
 *
 * This is not a test stub — it is the planner that runs in demo mode and
 * whenever the model is unreachable, so it has to produce something a user
 * could actually follow. The phases mirror the shape of most self-directed
 * goals: establish a baseline, build volume, push past the plateau, consolidate.
 */
export function fallbackRoadmap(goal: string): Roadmap {
  const label = goal.slice(0, 40);
  return {
    milestones: [
      {
        title: `Foundations for: ${label}`,
        description:
          "Establish a baseline, gather what you need, and remove obvious blockers.",
        successCriteria:
          "Your starting point is written down and the first 2 weeks of sessions are scheduled.",
        order: 0,
        targetWeekOffset: 2,
      },
      {
        title: "Build momentum",
        description: "Put in consistent reps on the core activity for this goal.",
        successCriteria: "4 consecutive weeks with at least 3 sessions completed each week.",
        order: 1,
        targetWeekOffset: 5,
      },
      {
        title: "Push past the plateau",
        description:
          "Increase difficulty and address the gaps the Progress agent surfaces.",
        successCriteria: "At least 1 measured improvement over the week-0 baseline, written down.",
        order: 2,
        targetWeekOffset: 8,
      },
      {
        title: "Consolidate & finish",
        description: "Lock in the gains and reach the target outcome.",
        successCriteria: "The goal's stated outcome achieved and held for 2 consecutive weeks.",
        order: 3,
        targetWeekOffset: 10,
      },
    ],
  };
}

const FALLBACK_QUESTIONS = [
  "What is your current experience level with this goal?",
  "How many hours per week can you realistically dedicate to this?",
  "By when do you want to achieve this goal?",
];

// ---------------------------------------------------------------------------
// Agent calls
// ---------------------------------------------------------------------------

/**
 * The model has no clock. "By the end of the year" is meaningless to it
 * without today's date, and the eval harness showed exactly that: a 24-week
 * plan against a 16-week deadline. The date goes in the user turn, not the
 * system block, so it never invalidates the cached prefix.
 */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Three questions used to personalize the roadmap before it is generated. */
export async function generateClarifyingQuestions(
  goal: string,
  opts: ArchitectOptions = {}
): Promise<AgentOutcome<string[]>> {
  const outcome = await generate({
    label: "architect.clarify",
    model: opts.model ?? modelFor("architect"),
    userId: opts.userId,
    maxTokens: 2048,
    schema: ClarifyingQuestionsSchema,
    system: `You help people plan long-term goals. Given a goal statement, write
exactly 3 concise clarifying questions whose answers would let a planner build
a better, more personal roadmap. Ask about things that cannot be inferred from
the goal alone — current level, time available, constraints, or deadline.

${UNTRUSTED_NOTICE}`,
    prompt: `The goal:
${untrusted(goal)}`,
    fallback: () => ({ questions: FALLBACK_QUESTIONS }),
  });

  // Unwrap to a bare string[] so callers don't deal with the envelope object.
  return { ...outcome, data: outcome.data.questions.slice(0, 3) };
}

/** Build the initial milestone roadmap for a goal. */
export async function generateRoadmap(
  goal: string,
  clarifications: Clarification[],
  opts: ArchitectOptions = {}
): Promise<AgentOutcome<Roadmap>> {
  const context = clarifications.length
    ? untrusted(clarifications.map((c) => `Q: ${c.question}\nA: ${c.answer}`).join("\n\n"))
    : "(no additional context provided)";

  return generate({
    label: "architect.roadmap",
    model: opts.model ?? modelFor("architect"),
    userId: opts.userId,
    maxTokens: 8192,
    schema: RoadmapSchema,
    fallback: () => fallbackRoadmap(goal),
    system: `You are a goal-planning architect. Break a goal into a roadmap of
3-6 sequential milestones — phases of work, not day-to-day tasks.

Each milestone needs a concrete success criterion that can actually be checked,
and a targetWeekOffset: the week, in whole weeks from the start of the goal,
by which that milestone should be complete. Order them from 0, in the sequence
they should be tackled. Respect any deadline or time budget the user states:
the last milestone's week offset must land at or before the deadline, and the
amount of work implied should fit the hours they said they have. When the
user gives a deadline as a date or a phrase ("by June", "end of the year"),
convert it to weeks from today's date, which is given with the goal.

${UNTRUSTED_NOTICE}`,
    prompt: `Today's date: ${todayISO()}

Goal:
${untrusted(goal)}

What the user told us:
${context}`,
  });
}

/** Revise an existing roadmap in response to a user request. */
export async function adjustRoadmap(
  goal: string,
  milestones: Array<{ title: string; description: string; order: number }>,
  request: string,
  opts: ArchitectOptions = {}
): Promise<AgentOutcome<Roadmap>> {
  const current = milestones
    .map((m) => `${m.order}. ${m.title}: ${m.description}`)
    .join("\n");

  return generate({
    label: "architect.adjust",
    model: opts.model ?? modelFor("architect"),
    userId: opts.userId,
    maxTokens: 8192,
    schema: RoadmapSchema,
    // If the model can't be reached we keep the roadmap exactly as it was
    // rather than inventing a new one: silently replacing a user's plan with
    // generic phases because an API call failed would be worse than no change.
    fallback: () => ({
      milestones: milestones.map((m) => ({
        title: m.title,
        description: m.description,
        successCriteria: "",
        order: m.order,
        targetWeekOffset: (m.order + 1) * 2,
      })),
    }),
    system: `You are a goal-planning architect. Revise an existing milestone
roadmap to reflect a request from the user. Keep it to 3-6 sequential
milestones, and preserve any milestone the request does not affect, including
its wording.

${UNTRUSTED_NOTICE}`,
    prompt: `Goal:
${untrusted(goal)}

Current roadmap:
${current}

The user asks:
${untrusted(request)}`,
  });
}
