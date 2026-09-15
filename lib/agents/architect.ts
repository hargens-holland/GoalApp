import { generate, type AgentOutcome } from "./client";
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
          "You can name your starting point and have what you need to begin.",
        order: 0,
        targetWeekOffset: 0,
      },
      {
        title: "Build momentum",
        description: "Put in consistent reps on the core activity for this goal.",
        successCriteria: "Four consistent weeks of deliberate effort logged.",
        order: 1,
        targetWeekOffset: 2,
      },
      {
        title: "Push past the plateau",
        description:
          "Increase difficulty and address the gaps the Progress agent surfaces.",
        successCriteria: "A measurable improvement over your baseline.",
        order: 2,
        targetWeekOffset: 6,
      },
      {
        title: "Consolidate & finish",
        description: "Lock in the gains and reach the target outcome.",
        successCriteria: "Goal outcome achieved and sustainable.",
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

/** Three questions used to personalize the roadmap before it is generated. */
export async function generateClarifyingQuestions(
  goal: string,
  opts: { userId?: string } = {}
): Promise<AgentOutcome<string[]>> {
  const outcome = await generate({
    label: "architect.clarify",
    userId: opts.userId,
    maxTokens: 512,
    schema: ClarifyingQuestionsSchema,
    prompt: `A user wants to achieve this goal: "${goal}"

Write exactly 3 concise clarifying questions whose answers would let you build a
better, more personal roadmap. Ask about things you cannot infer from the goal
statement alone — current level, time available, constraints, or deadline.`,
    fallback: () => ({ questions: FALLBACK_QUESTIONS }),
  });

  // Unwrap to a bare string[] so callers don't deal with the envelope object.
  return { ...outcome, data: outcome.data.questions.slice(0, 3) };
}

/** Build the initial milestone roadmap for a goal. */
export async function generateRoadmap(
  goal: string,
  clarifications: Clarification[],
  opts: { userId?: string } = {}
): Promise<AgentOutcome<Roadmap>> {
  const context = clarifications.length
    ? clarifications.map((c) => `Q: ${c.question}\nA: ${c.answer}`).join("\n\n")
    : "(no additional context provided)";

  return generate({
    label: "architect.roadmap",
    userId: opts.userId,
    maxTokens: 2048,
    schema: RoadmapSchema,
    fallback: () => fallbackRoadmap(goal),
    prompt: `You are a goal-planning architect. Break this goal into a roadmap of
3-6 sequential milestones — phases of work, not day-to-day tasks.

Goal: "${goal}"

What the user told us:
${context}

Each milestone needs a concrete success criteria that can actually be checked,
and a targetWeekOffset counted in whole weeks from the start of the goal.
Order them from 0, in the sequence they should be tackled.`,
  });
}

/** Revise an existing roadmap in response to a user request. */
export async function adjustRoadmap(
  goal: string,
  milestones: Array<{ title: string; description: string; order: number }>,
  request: string,
  opts: { userId?: string } = {}
): Promise<AgentOutcome<Roadmap>> {
  const current = milestones
    .map((m) => `${m.order}. ${m.title}: ${m.description}`)
    .join("\n");

  return generate({
    label: "architect.adjust",
    userId: opts.userId,
    maxTokens: 2048,
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
        targetWeekOffset: m.order * 2,
      })),
    }),
    prompt: `You are a goal-planning architect. Revise this milestone roadmap to
reflect the user's request. Keep it to 3-6 sequential milestones.

Goal: "${goal}"

Current roadmap:
${current}

The user asks: "${request}"

Preserve any milestone the request does not affect, including its wording.`,
  });
}
