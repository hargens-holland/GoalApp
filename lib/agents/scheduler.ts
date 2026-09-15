import { generate, type AgentOutcome } from "./client";
import { UNTRUSTED_NOTICE, untrusted } from "./prompt";
import { modelFor } from "./models";
import { ScheduleSchema, type GeneratedDailyTask, type Schedule } from "./schemas";

/**
 * SCHEDULER AGENT
 *
 * Turns the current focus of ALL active goals into concrete, dated daily tasks
 * across a date range, balanced so no day is overloaded and respecting how much
 * time is actually available each day.
 *
 * It is also the "editor" of the system: adding a goal, or asking for an
 * adjustment, re-runs this across the affected days rather than patching
 * individual tasks. That is what makes regeneration adaptive — the whole week
 * is re-laid-out against current state instead of accumulating edits.
 *
 * It decides which *day* a task lands on. Time-of-day slotting is a separate,
 * deterministic step in lib/scheduling (placeTasks), because packing tasks into
 * free blocks is exact arithmetic that a model should not be doing.
 */

export interface SchedulerGoalInput {
  id: string;
  title: string;
  focusForWeek: string;
  currentMilestoneId: string | null;
  currentMilestoneTitle: string | null;
}

export interface DayCapacity {
  /** YYYY-MM-DD */
  date: string;
  availableMinutes: number;
}

export interface ExistingTaskInput {
  goalId: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
}

/**
 * Round-robin each goal's work across the days that have capacity.
 *
 * Used in demo mode and on model failure. Simple by design: roughly three
 * touchpoints per goal, spread evenly so no single day absorbs everything.
 *
 * Task titles are built from the goal's current milestone rather than the goal
 * itself, because the milestone is the more specific thing — "Clean chord
 * transitions" is actionable in a way "Learn fingerstyle guitar" is not. This
 * matters more than it looks: the public demo runs in this mode permanently, so
 * regenerating a week there has to produce something a reader finds plausible.
 * It does not try to imitate model output — a deterministic planner cannot
 * invent domain-specific work, and pretending otherwise would be dishonest.
 */
export function fallbackSchedule(
  goals: SchedulerGoalInput[],
  days: DayCapacity[]
): Schedule {
  const tasks: GeneratedDailyTask[] = [];
  const openDays = days.filter((d) => d.availableMinutes >= 30);
  if (!openDays.length || !goals.length) return { tasks };

  /** Vary the framing so a week doesn't read as three identical rows. */
  const SESSION_FRAMINGS = [
    { prefix: "Focused session", minutes: 60 },
    { prefix: "Practice block", minutes: 45 },
    { prefix: "Review & consolidate", minutes: 30 },
  ];

  let dayIndex = 0;
  for (const goal of goals) {
    const subject = goal.currentMilestoneTitle?.trim() || goal.title;

    SESSION_FRAMINGS.forEach((framing, n) => {
      const day = openDays[dayIndex % openDays.length];
      dayIndex++;
      tasks.push({
        goalId: goal.id,
        milestoneId: goal.currentMilestoneId,
        title: `${framing.prefix}: ${subject}`,
        description:
          goal.focusForWeek ||
          `Make progress on "${subject}" toward ${goal.title}.`,
        date: day.date,
        estimatedMinutes: Math.min(
          framing.minutes,
          // Never propose a session longer than the day can hold.
          Math.max(30, day.availableMinutes)
        ),
      });
    });
  }
  return { tasks };
}

/**
 * Discard tasks the model produced that reference something real.
 *
 * The schema guarantees each task is *shaped* correctly; it cannot guarantee
 * the ids and dates are ones we asked about. Without this, a hallucinated
 * goalId would violate a foreign key at insert time, and an out-of-range date
 * would silently write a task into a week the user wasn't looking at. This is
 * the semantic half of validation, and it runs on fallback output too so both
 * paths get the same guarantees.
 */
export function keepValidTasks(
  tasks: GeneratedDailyTask[],
  goals: SchedulerGoalInput[],
  days: DayCapacity[]
): GeneratedDailyTask[] {
  const goalIds = new Set(goals.map((g) => g.id));
  // A day with no availability is not a valid target. The prompt says so, but
  // the model does not always listen, and a task on a closed day would reach
  // the time-slot packer with nowhere to go and land un-slotted on a day the
  // user said was off. Enforcing it here means the constraint the Availability
  // page promises ("tasks only land inside your windows") holds regardless of
  // what the model returns.
  const dayDates = new Set(days.filter((d) => d.availableMinutes > 0).map((d) => d.date));
  // A milestone id must belong to the goal the task is attached to, otherwise
  // it is dropped rather than creating a cross-goal reference.
  const milestoneByGoal = new Map(
    goals.map((g) => [g.id, g.currentMilestoneId] as const)
  );

  return tasks
    .filter((t) => goalIds.has(t.goalId) && dayDates.has(t.date))
    .map((t) => ({
      ...t,
      milestoneId:
        t.milestoneId && milestoneByGoal.get(t.goalId) === t.milestoneId
          ? t.milestoneId
          : (milestoneByGoal.get(t.goalId) ?? null),
      // Guard against zero/negative durations, which would make the time-slot
      // packer place a task with no width.
      estimatedMinutes:
        Number.isFinite(t.estimatedMinutes) && t.estimatedMinutes > 0
          ? Math.min(t.estimatedMinutes, 8 * 60)
          : 30,
    }));
}

export async function scheduleTasks(input: {
  goals: SchedulerGoalInput[];
  days: DayCapacity[];
  existingTasks: ExistingTaskInput[];
  userId?: string;
  /** Override the configured model, e.g. from an eval run. */
  model?: string;
}): Promise<AgentOutcome<Schedule>> {
  const { goals, days, existingTasks, userId } = input;

  // Nothing to schedule — don't spend a request finding that out.
  if (!goals.length || !days.length) {
    return { data: { tasks: [] }, source: "fallback", reason: "demo_mode", attempts: 0 };
  }

  // Ids are ours; titles and focus text trace back to the user (goal titles
  // directly, focus via the Progress agent reading their notes).
  const goalsText = goals
    .map(
      (g) =>
        `[goalId:${g.id}] [milestoneId:${g.currentMilestoneId ?? "null"}]\n${untrusted(
          `title: ${g.title}\ncurrent milestone: ${g.currentMilestoneTitle || "n/a"}\nfocus: ${g.focusForWeek || "n/a"}`
        )}`
    )
    .join("\n\n");

  const daysText = days
    .map((d) => `${d.date}: ${d.availableMinutes} min available`)
    .join("\n");

  const existingText = existingTasks.length
    ? existingTasks.map((t) => `${t.date} — ${t.title}`).join("\n")
    : "none";

  const outcome = await generate({
    label: "scheduler.week",
    model: input.model ?? modelFor("scheduler"),
    userId,
    // Sized for a full week across several goals. Generous because a truncated
    // schedule is discarded entirely, which is more expensive than the tokens.
    maxTokens: 4096,
    schema: ScheduleSchema,
    fallback: () => fallbackSchedule(goals, days),
    prompt: `You are a scheduling agent. Lay out concrete daily tasks for the
user's active goals across the given days.

${UNTRUSTED_NOTICE}

Active goals:
${goalsText}

Days and available capacity:
${daysText}

Tasks already scheduled in this range — do not duplicate these:
${existingText}

Rules:
- Use the exact goalId and milestoneId values shown above.
- Every date must be one of the days listed above.
- The task estimates on any single day must fit inside that day's available
  minutes. Skip days with no availability entirely.
- Balance work across goals rather than finishing one before starting another.
- Build on each goal's stated focus. Make each task specific enough to act on
  without further planning.`,
  });

  const tasks = keepValidTasks(outcome.data.tasks, goals, days);

  // Everything the model produced was unusable — fall back rather than
  // writing an empty week over a user's existing plan.
  if (!tasks.length && outcome.source === "llm") {
    return {
      data: { tasks: keepValidTasks(fallbackSchedule(goals, days).tasks, goals, days) },
      source: "fallback",
      reason: "invalid_output",
      attempts: outcome.attempts,
    };
  }

  return { ...outcome, data: { tasks } };
}
