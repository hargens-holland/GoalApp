import { callClaude, parseJson } from "./shared";

/**
 * SCHEDULER AGENT
 * Job: turn the current focus of ALL active goals into concrete, dated daily
 * tasks for a date range, balanced so no day is overloaded and respecting how
 * much time is available each day. Runs daily/weekly, and is ALSO the "editor":
 * adding a goal or making an adjustment just re-runs this across the affected
 * days. It picks which day a task lands on; time-of-day slotting is done later
 * by lib/scheduling (placeTasks).
 */

export interface SchedulerGoalInput {
  id: string;
  title: string;
  focusForWeek: string;
  currentMilestoneId: string | null;
  currentMilestoneTitle: string | null;
}

export interface DayCapacity {
  date: string; // YYYY-MM-DD
  availableMinutes: number;
}

export interface ExistingTaskInput {
  goalId: string;
  title: string;
  date: string; // YYYY-MM-DD
}

export interface GeneratedDailyTask {
  goalId: string;
  milestoneId: string | null;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  estimatedMinutes: number;
}

export interface Schedule {
  tasks: GeneratedDailyTask[];
}

/** Round-robin goals across days that have capacity. */
function mockSchedule(
  goals: SchedulerGoalInput[],
  days: DayCapacity[]
): Schedule {
  const tasks: GeneratedDailyTask[] = [];
  const openDays = days.filter((d) => d.availableMinutes >= 30);
  if (!openDays.length || !goals.length) return { tasks };
  let di = 0;
  for (const goal of goals) {
    // ~3 touchpoints per goal across the range
    for (let n = 0; n < 3; n++) {
      const day = openDays[di % openDays.length];
      di++;
      tasks.push({
        goalId: goal.id,
        milestoneId: goal.currentMilestoneId,
        title: `${goal.title}: session ${n + 1}`,
        description: goal.focusForWeek || `Work toward "${goal.title}".`,
        date: day.date,
        estimatedMinutes: 45,
      });
    }
  }
  return { tasks };
}

export async function scheduleTasks(input: {
  goals: SchedulerGoalInput[];
  days: DayCapacity[];
  existingTasks: ExistingTaskInput[];
}): Promise<Schedule> {
  const { goals, days, existingTasks } = input;
  if (!goals.length || !days.length) return { tasks: [] };

  const goalsText = goals
    .map(
      (g) =>
        `[goalId:${g.id}] "${g.title}" | current milestone: ${
          g.currentMilestoneTitle || "n/a"
        } [milestoneId:${g.currentMilestoneId ?? "null"}] | focus: ${
          g.focusForWeek || "n/a"
        }`
    )
    .join("\n");

  const daysText = days
    .map((d) => `${d.date}: ${d.availableMinutes} min available`)
    .join("\n");

  const existingText = existingTasks.length
    ? existingTasks.map((t) => `${t.date} — ${t.title}`).join("\n")
    : "none";

  const text = await callClaude(
    `You are a scheduling agent. Lay out concrete daily tasks for the user's active goals across the given days. Balance work across goals and days; never exceed a day's available minutes (sum of task estimates per day must fit). Build on the focus for each goal. Do not duplicate existing tasks.\n\nActive goals:\n${goalsText}\n\nDays and capacity:\n${daysText}\n\nExisting tasks (avoid duplicating):\n${existingText}\n\nReturn raw JSON only. Use the exact goalId and milestoneId from above:\n{"tasks":[{"goalId":"...","milestoneId":"... or null","title":"...","description":"...","date":"YYYY-MM-DD","estimatedMinutes":45}]}`,
    2048
  );
  if (!text) return mockSchedule(goals, days);
  const parsed = parseJson<Schedule>(text, { tasks: [] });
  if (!parsed.tasks?.length) return mockSchedule(goals, days);

  // Guard: keep only tasks that reference a real goal and a valid in-range day.
  const goalIds = new Set(goals.map((g) => g.id));
  const dayDates = new Set(days.map((d) => d.date));
  const tasks = parsed.tasks.filter(
    (t) => goalIds.has(t.goalId) && dayDates.has(t.date)
  );
  return { tasks: tasks.length ? tasks : mockSchedule(goals, days).tasks };
}
