import { prisma } from "@/lib/prisma";
import { scheduleTasks, type SchedulerGoalInput } from "@/lib/agents/scheduler";
import type { FallbackReason } from "@/lib/agents/client";
import { fromISODate, toISODate } from "@/lib/dates";
import { notFinishedFilter } from "@/lib/tasks";
import { getAvailability } from "./availability";
import { placeTasks, subtractBusy, type BusyInterval } from "./placement";

export interface SchedulerRunResult {
  created: number;
  /** Whether the layout came from the model or deterministic planning. */
  source: "llm" | "fallback";
  reason?: FallbackReason;
}

/**
 * Run the Scheduler agent end-to-end for a date range:
 *
 *   load active goals + their current focus
 *     -> read availability
 *       -> scheduleTasks (the agent decides which day each task lands on)
 *         -> placeTasks (deterministic time-of-day slotting)
 *           -> persist
 *
 * This is the single place the week is (re)built, and it is what makes plan
 * regeneration adaptive: goal creation, an explicit adjustment, and a weekly
 * refresh all funnel through here rather than patching individual tasks.
 *
 * Idempotent within the range: incomplete tasks in [start, end] are replaced
 * wholesale, while completed ones are always preserved — regenerating a week
 * can never erase work the user already did.
 */
export async function runScheduler(
  userId: string,
  start: Date,
  end: Date,
  goalIds?: string[]
): Promise<SchedulerRunResult> {
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
  if (!goals.length) return { created: 0, source: "fallback", reason: "demo_mode" };

  const startISO = toISODate(start);
  const endISO = toISODate(end);

  // Each goal's current focus comes from the latest Progress snapshot, falling
  // back to the active milestone's description if the goal has never been
  // reviewed. Without this the Scheduler would have no sense of *what* to
  // schedule, only which goals exist.
  const schedulerGoals: SchedulerGoalInput[] = goals.map((g) => {
    const latestSnapshot = g.snapshots[0];
    const currentMilestone =
      g.milestones.find((m) => m.id === latestSnapshot?.currentMilestoneId) ??
      g.milestones.find((m) => m.status === "active") ??
      g.milestones[0] ??
      null;

    return {
      id: g.id,
      title: g.title,
      focusForWeek:
        latestSnapshot?.focusForWeek ||
        currentMilestone?.description ||
        `Make progress on "${g.title}".`,
      currentMilestoneId: currentMilestone?.id ?? null,
      currentMilestoneTitle: currentMilestone?.title ?? null,
    };
  });

  // Finished and skipped tasks survive regeneration (see the transaction
  // below), and they still occupy their time slots. Carve those out of the
  // free windows before asking the model how much capacity each day has, and
  // before packing — otherwise the new week is laid on top of the old one.
  const existing = await prisma.task.findMany({
    where: { goalId: { in: goals.map((g) => g.id) }, date: { gte: start, lte: end } },
    select: { goalId: true, title: true, date: true, status: true, scheduledStart: true, scheduledEnd: true },
  });
  const kept: BusyInterval[] = existing
    .filter((t) => (t.status === "done" || t.status === "skipped") && t.scheduledStart && t.scheduledEnd)
    .map((t) => ({
      date: toISODate(t.date),
      startMinute: t.scheduledStart!.getUTCHours() * 60 + t.scheduledStart!.getUTCMinutes(),
      endMinute: t.scheduledEnd!.getUTCHours() * 60 + t.scheduledEnd!.getUTCMinutes(),
    }));

  const availability = subtractBusy(await getAvailability(userId, start, end), kept);
  const days = availability.map((a) => ({
    date: a.date,
    availableMinutes: a.availableMinutes,
  }));

  const outcome = await scheduleTasks({
    goals: schedulerGoals,
    days,
    userId,
    existingTasks: existing.map((t) => ({
      goalId: t.goalId,
      title: t.title,
      date: toISODate(t.date),
    })),
  });

  const tasks = outcome.data.tasks.filter(
    (t) => t.date >= startISO && t.date <= endISO
  );

  // Slot each task into a concrete time block.
  //
  // placeTasks groups by day internally, so its output order does NOT match the
  // input order. The task's index is passed as its id and the results are keyed
  // back by that id — indexing `placed[i]` positionally would hand tasks each
  // other's time slots whenever the scheduler emits days out of order.
  const placed = placeTasks(
    tasks.map((t, i) => ({
      id: String(i),
      date: t.date,
      estimatedMinutes: t.estimatedMinutes,
    })),
    availability
  );
  const slotById = new Map(placed.map((p) => [p.id, p]));

  const rows = tasks.map((t, i) => {
    const slot = slotById.get(String(i));
    return {
      goalId: t.goalId,
      milestoneId: t.milestoneId || null,
      title: t.title,
      description: t.description,
      date: fromISODate(t.date),
      estimatedMinutes: t.estimatedMinutes,
      scheduledStart: slot?.scheduledStart ?? null,
      scheduledEnd: slot?.scheduledEnd ?? null,
      order: i,
    };
  });

  // Delete-then-insert in one transaction. Previously these were separate
  // statements with the inserts in a serial loop, so a failure partway through
  // left the user with a half-written week after their old one was already
  // gone. Either the whole new layout lands or the old one is untouched.
  //
  // The delete is scoped to unfinished work: done *and* skipped tasks survive,
  // because in both cases the user already made a decision about them.
  await prisma.$transaction([
    prisma.task.deleteMany({
      where: {
        goalId: { in: goals.map((g) => g.id) },
        date: { gte: start, lte: end },
        ...notFinishedFilter(),
      },
    }),
    prisma.task.createMany({ data: rows }),
  ]);

  return { created: rows.length, source: outcome.source, reason: outcome.reason };
}
