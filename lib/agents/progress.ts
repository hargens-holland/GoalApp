import { callClaude, parseJson } from "./shared";

/**
 * PROGRESS AGENT
 * Job: figure out WHERE the user is in their roadmap. Runs weekly. It reads the
 * roadmap plus the past period's task completions/notes and returns an
 * assessment — it deliberately does NOT write tasks (that's the Scheduler). This
 * is the "where am I in the plan" agent, kept separate so evaluation and
 * task-writing never blur together.
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

export interface ProgressAssessment {
  currentMilestoneId: string | null;
  progressPercent: number; // 0-100 across the whole goal
  summary: string;
  focusForWeek: string;
  // milestone ids the agent now considers done
  completedMilestoneIds: string[];
}

function mockAssessment(
  milestones: MilestoneInput[],
  completions: CompletionInput[]
): ProgressAssessment {
  const doneCount = completions.filter((c) => c.completed).length;
  const total = completions.length || 1;
  const ratio = doneCount / total;
  // Advance to the first not-done milestone, biased by completion ratio.
  const ordered = [...milestones].sort((a, b) => a.order - b.order);
  const idx = Math.min(
    ordered.length - 1,
    Math.floor(ratio * ordered.length)
  );
  const current = ordered[idx] || null;
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

export async function assessProgress(
  goal: string,
  milestones: MilestoneInput[],
  completions: CompletionInput[]
): Promise<ProgressAssessment> {
  const roadmap = milestones
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

  const text = await callClaude(
    `You are a progress-tracking agent. Given a goal, its milestone roadmap, and the last period's task results, assess where the user currently is. Do NOT invent tasks.\n\nGoal: "${goal}"\n\nRoadmap:\n${roadmap || "none"}\n\nLast period's tasks:\n${recent || "none"}\n\nReturn raw JSON only:\n{"currentMilestoneId":"<the id of the milestone they are actively working on, or null>","progressPercent":<0-100 overall>,"summary":"<2 sentences on where they stand>","focusForWeek":"<one clear focus for the coming week>","completedMilestoneIds":["<ids of milestones now fully met>"]}`,
    768
  );
  if (!text) return mockAssessment(milestones, completions);
  const parsed = parseJson<ProgressAssessment | null>(text, null);
  return parsed && typeof parsed.progressPercent === "number"
    ? {
        currentMilestoneId: parsed.currentMilestoneId ?? null,
        progressPercent: Math.max(0, Math.min(100, parsed.progressPercent)),
        summary: parsed.summary ?? "",
        focusForWeek: parsed.focusForWeek ?? "",
        completedMilestoneIds: parsed.completedMilestoneIds ?? [],
      }
    : mockAssessment(milestones, completions);
}
