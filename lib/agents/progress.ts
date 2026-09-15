import { generate, type AgentOutcome } from "./client";
import { ProgressAssessmentSchema, type ProgressAssessment } from "./schemas";

/**
 * PROGRESS AGENT
 *
 * Works out WHERE the user is in their roadmap. Runs weekly. It reads the
 * roadmap plus the last period's task completions and notes, and returns an
 * assessment — it deliberately does not write tasks, which is the Scheduler's
 * job. Keeping evaluation and task-writing in separate agents means a bad
 * assessment can never silently rewrite someone's week, and each can be
 * evaluated on its own.
 */

export interface MilestoneInput {
  id: string;
  title: string;
  successCriteria: string | null;
  order: number;
  status: string;
}

export interface CompletionInput {
  title: string;
  completed: boolean;
  notes: string | null;
}

/**
 * Estimate progress arithmetically from completion ratio.
 *
 * Used in demo mode and whenever the model is unavailable. It cannot read the
 * user's notes the way the model can, but it advances through the roadmap in
 * proportion to how much of the recent work actually got done, which is a
 * defensible approximation.
 */
export function fallbackAssessment(
  milestones: MilestoneInput[],
  completions: CompletionInput[]
): ProgressAssessment {
  const doneCount = completions.filter((c) => c.completed).length;
  const total = completions.length || 1;
  const ratio = doneCount / total;

  const ordered = [...milestones].sort((a, b) => a.order - b.order);
  const idx = Math.min(ordered.length - 1, Math.floor(ratio * ordered.length));
  const current = ordered[idx] ?? null;

  return {
    currentMilestoneId: current?.id ?? null,
    progressPercent: Math.round(
      ((idx + ratio) / Math.max(ordered.length, 1)) * 100
    ),
    summary: `Completed ${doneCount}/${total} tasks in the last period.`,
    focusForWeek: current
      ? `Keep working toward "${current.title}".`
      : "Review your goal and set a focus for the week.",
    completedMilestoneIds: ordered.slice(0, idx).map((m) => m.id),
  };
}

/**
 * Clamp and tidy a raw assessment.
 *
 * The schema guarantees `progressPercent` is a number but not that it is a
 * sensible one. A model that returns 103 has still produced a useful
 * assessment, so this clamps rather than rejecting the whole response.
 * Milestone ids are filtered against the ones actually passed in, so a
 * hallucinated id can never be written to the database.
 */
export function normalizeAssessment(
  assessment: ProgressAssessment,
  milestones: MilestoneInput[]
): ProgressAssessment {
  const knownIds = new Set(milestones.map((m) => m.id));
  return {
    ...assessment,
    progressPercent: Math.max(0, Math.min(100, Math.round(assessment.progressPercent))),
    currentMilestoneId:
      assessment.currentMilestoneId && knownIds.has(assessment.currentMilestoneId)
        ? assessment.currentMilestoneId
        : null,
    completedMilestoneIds: assessment.completedMilestoneIds.filter((id) =>
      knownIds.has(id)
    ),
  };
}

export async function assessProgress(
  goal: string,
  milestones: MilestoneInput[],
  completions: CompletionInput[],
  opts: { userId?: string } = {}
): Promise<AgentOutcome<ProgressAssessment>> {
  const roadmap = [...milestones]
    .sort((a, b) => a.order - b.order)
    .map(
      (m) =>
        `[id:${m.id}] (#${m.order}, ${m.status}) ${m.title} — success: ${
          m.successCriteria || "n/a"
        }`
    )
    .join("\n");

  const recent = completions
    .map(
      (c) =>
        `- ${c.completed ? "[done]" : "[not done]"} ${c.title}${
          c.notes ? ` (notes: ${c.notes})` : ""
        }`
    )
    .join("\n");

  const outcome = await generate({
    label: "progress.assess",
    userId: opts.userId,
    maxTokens: 1024,
    schema: ProgressAssessmentSchema,
    fallback: () => fallbackAssessment(milestones, completions),
    prompt: `You are a progress-tracking agent. Given a goal, its milestone
roadmap, and the results of the last period's tasks, assess where the user
currently stands. Do not invent tasks — that is another agent's job.

Goal: "${goal}"

Roadmap:
${roadmap || "none"}

Last period's tasks:
${recent || "none"}

Use the exact milestone ids shown above. Set currentMilestoneId to the milestone
they are actively working on, or null if none applies. Base the assessment on
what was actually completed, and pay attention to any notes the user left.`,
  });

  return { ...outcome, data: normalizeAssessment(outcome.data, milestones) };
}
