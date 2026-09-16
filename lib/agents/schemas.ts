import { z } from "zod";

/**
 * Output contracts for the three planning agents.
 *
 * These schemas do double duty:
 *
 *  1. They are compiled to JSON Schema and sent to the Anthropic API as
 *     `output_config.format`, so the model is *constrained* to emit conforming
 *     JSON rather than merely asked to. This eliminates the entire class of
 *     "model wrapped its JSON in prose or a code fence" failures.
 *
 *  2. They validate the response client-side after parsing. The API guarantees
 *     structural conformance, but not that the values make sense — so the
 *     agents layer a second, semantic pass on top (e.g. discarding scheduled
 *     tasks that reference a goal the user doesn't own).
 *
 * A note on constraints: the structured-output JSON Schema subset does not
 * support numeric bounds (`minimum`/`maximum`) or array-length bounds. The
 * TypeScript SDK strips those from the schema it sends and enforces them
 * client-side instead, so `.min()` here still protects us — it just fails at
 * parse time rather than generation time. Bounds are used only for invariants
 * genuinely worth rejecting a whole response over; softer expectations (an
 * ideal milestone count, a percentage in range) are stated in the prompt and
 * normalized in code, because discarding an otherwise-good plan over an
 * off-by-one is a worse outcome than clamping it.
 */

/** A clarifying question and the user's answer, gathered before planning. */
export interface Clarification {
  question: string;
  answer: string;
}

// ---------------------------------------------------------------------------
// Architect
// ---------------------------------------------------------------------------

export const ClarifyingQuestionsSchema = z.object({
  questions: z
    .array(z.string())
    .min(1)
    .describe("Concise clarifying questions to personalize the roadmap."),
});
export type ClarifyingQuestions = z.infer<typeof ClarifyingQuestionsSchema>;

export const MilestoneSchema = z.object({
  title: z.string().describe("Short name for this phase of the goal."),
  description: z.string().describe("What the user actually does in this phase."),
  successCriteria: z
    .string()
    .describe("A concrete, checkable condition that means this phase is done."),
  order: z.number().int().describe("0-based position in the sequence."),
  // Due-week semantics, chosen after the eval harness showed the model reads
  // "targeted" as a due date while the app had been treating it as a start
  // date. A due date is the natural reading for a milestone, so the app moved.
  targetWeekOffset: z
    .number()
    .int()
    .describe(
      "The week, counted in whole weeks from the goal's start, by which this milestone should be complete. The first milestone's is at least 1; each later one is at or after the previous; the last lands at or before the user's deadline."
    ),
});
export type GeneratedMilestone = z.infer<typeof MilestoneSchema>;

export const RoadmapSchema = z.object({
  // A roadmap with zero milestones is not a degraded result, it's a useless
  // one — nothing downstream (progress assessment, scheduling) can run without
  // at least one. This is the one hard invariant worth failing the response for.
  milestones: z.array(MilestoneSchema).min(1),
});
export type Roadmap = z.infer<typeof RoadmapSchema>;

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export const ProgressAssessmentSchema = z.object({
  currentMilestoneId: z
    .string()
    .nullable()
    .describe("Id of the milestone being actively worked, or null."),
  // Deliberately unbounded here and clamped to 0-100 after parsing: a model
  // that returns 103 has still produced a useful assessment.
  progressPercent: z.number().describe("Overall completion across the goal, 0-100."),
  summary: z.string().describe("Two sentences on where the user stands."),
  focusForWeek: z.string().describe("One clear focus for the coming week."),
  completedMilestoneIds: z
    .array(z.string())
    .describe("Ids of milestones now fully met."),
});
export type ProgressAssessment = z.infer<typeof ProgressAssessmentSchema>;

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export const DailyTaskSchema = z.object({
  goalId: z.string().describe("Must be one of the goal ids supplied in the prompt."),
  milestoneId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  date: z.string().describe("The day for this task, as YYYY-MM-DD."),
  estimatedMinutes: z.number().int().describe("Expected working minutes."),
});
export type GeneratedDailyTask = z.infer<typeof DailyTaskSchema>;

export const ScheduleSchema = z.object({
  // An empty schedule is legitimate — a week with no availability should
  // produce no tasks — so there is no minimum here.
  tasks: z.array(DailyTaskSchema),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

// ---------------------------------------------------------------------------
// Coordinator
// ---------------------------------------------------------------------------

/**
 * What the user asked for, as one of a fixed set of actions the app knows how
 * to carry out. The Coordinator classifies; code executes. A flat object with
 * nullable slots rather than a discriminated union, because structured
 * outputs render a union as anyOf and a flat shape is both easier for the
 * model to fill and easier to validate afterwards.
 */
export const INTENT_ACTIONS = [
  "clear_day",
  "replan_week",
  "pause_goal",
  "resume_goal",
  "skip_task",
  "complete_task",
  "review_goal",
  "revise_roadmap",
  "answer",
  "unclear",
] as const;
export type IntentAction = (typeof INTENT_ACTIONS)[number];

export const IntentSchema = z.object({
  action: z.enum(INTENT_ACTIONS).describe(
    [
      "clear_day: the user cannot do a particular day; skip that day's unfinished tasks and re-lay the rest of the week.",
      "replan_week: rebuild the remaining days of this week from scratch.",
      "pause_goal / resume_goal: stop or restart scheduling one goal.",
      "skip_task / complete_task: change one task's status.",
      "review_goal: run the weekly progress review for one goal.",
      "revise_roadmap: the user wants a goal's milestones changed; carry their request through.",
      "answer: a question answerable from the context given; nothing to change.",
      "unclear: you cannot tell what they want or which goal or task they mean; ask.",
    ].join(" ")
  ),
  date: z.string().nullable().describe("YYYY-MM-DD for clear_day, resolved relative to today. Null otherwise."),
  goalId: z.string().nullable().describe("An id from the goals list, when the action concerns one goal. Null otherwise."),
  taskId: z.string().nullable().describe("An id from the tasks list, for skip_task or complete_task. Null otherwise."),
  request: z.string().nullable().describe("For revise_roadmap: what to change, in the user's own words. Null otherwise."),
  message: z
    .string()
    .describe(
      "One or two sentences to show the user. For an action: what you understood and what will happen, in plain words. For answer: the answer. For unclear: the question you need answered."
    ),
});
export type Intent = z.infer<typeof IntentSchema>;
