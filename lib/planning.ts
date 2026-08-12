import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { scheduleTasks, SchedulerGoalInput } from "@/lib/agents/scheduler";
import { getAvailability, placeTasks } from "@/lib/scheduling";
import { toISODate } from "@/lib/agents/shared";

/**
 * Orchestrates the Scheduler agent end-to-end for a date range:
 *   load active goals + their current focus  →  read availability  →
 *   scheduleTasks (agent)  →  placeTasks (time-of-day slotting)  →  persist.
 *
 * Used by goal creation, the /api/schedule route, and adjustments — i.e. the
 * single place the "editor" rebalances days. Idempotent within the range: it
 * clears not-yet-completed tasks in [start,end] before writing the new layout,
 * so completed work is always preserved.
 */
export async function runScheduler(
  userId: string,
  start: Date,
  end: Date,
  goalIds?: string[]
) {
  const goals = await prisma.goal.findMany({
    where: {
      userId,
      status: "active",
      ...(goalIds ? { id: { in: goalIds } } : {}),
    },
    include: {
      milestones: { orderBy: { order: "asc" } },
      snapshots: { orderBy: [{ year: "desc" }, { weekNumber: "desc" }], take: 1 },
    },
  });
  if (!goals.length) return { created: 0 };

  const startISO = toISODate(start);
  const endISO = toISODate(end);

  const schedulerGoals: SchedulerGoalInput[] = goals.map((g) => {
    const latest = g.snapshots[0];
    const currentMilestone =
      g.milestones.find((m) => m.id === latest?.currentMilestoneId) ||
      g.milestones.find((m) => m.status === "active") ||
      g.milestones[0] ||
      null;
    return {
      id: g.id,
      title: g.title,
      focusForWeek:
        latest?.focusForWeek ||
        currentMilestone?.description ||
        `Make progress on "${g.title}".`,
      currentMilestoneId: currentMilestone?.id ?? null,
      currentMilestoneTitle: currentMilestone?.title ?? null,
    };
  });

  const availability = await getAvailability(userId, start, end);
  const days = availability.map((a) => ({
    date: a.date,
    availableMinutes: a.availableMinutes,
  }));

  const existing = await prisma.task.findMany({
    where: { goalId: { in: goals.map((g) => g.id) }, date: { gte: start, lte: end } },
    select: { goalId: true, title: true, date: true },
  });
  const existingTasks = existing.map((t) => ({
    goalId: t.goalId,
    title: t.title,
    date: toISODate(t.date),
  }));

  const { tasks } = await scheduleTasks({ goals: schedulerGoals, days, existingTasks });

  // Slot each task into a concrete time block for the day view.
  const placed = placeTasks(
    tasks.map((t, i) => ({ id: String(i), date: t.date, estimatedMinutes: t.estimatedMinutes })),
    availability
  );

  // Replace the not-completed portion of the range, preserving completed work.
  await prisma.task.deleteMany({
    where: {
      goalId: { in: goals.map((g) => g.id) },
      date: { gte: start, lte: end },
      completed: false,
    },
  });

  let order = 0;
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (t.date < startISO || t.date > endISO) continue;
    const slot = placed[i];
    await prisma.task.create({
      data: {
        goalId: t.goalId,
        milestoneId: t.milestoneId || null,
        title: t.title,
        description: t.description,
        date: new Date(`${t.date}T00:00:00Z`),
        estimatedMinutes: t.estimatedMinutes,
        scheduledStart: slot?.scheduledStart ?? null,
        scheduledEnd: slot?.scheduledEnd ?? null,
        order: order++,
      } satisfies Prisma.TaskUncheckedCreateInput,
    });
  }

  return { created: tasks.length };
}
