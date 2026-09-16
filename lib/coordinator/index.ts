import { prisma } from "@/lib/prisma";
import type { CoordinatorContext } from "@/lib/agents/coordinator";
import type { Intent } from "@/lib/agents/schemas";
import { fromISODate, getWeekRange, toISODate } from "@/lib/dates";
import { runScheduler } from "@/lib/scheduling";
import { runReview } from "@/lib/operations/review";
import { reviseRoadmap } from "@/lib/operations/revise";
import { TASK_STATUS } from "@/lib/tasks";

/**
 * Carrying out what the Coordinator understood.
 *
 * Two phases, and the split is the point. `preview()` is pure: given the
 * intent and the context, it says in plain words what would change, and
 * nothing happens. `apply()` does it — through the same functions the buttons
 * use (runScheduler, runReview, reviseRoadmap), never through anything the
 * model wrote. The user sees the preview and confirms before apply runs.
 *
 * Ownership is enforced by construction: the context is loaded for one user,
 * and normalizeIntent has already dropped any id not in it.
 */

export interface Proposal {
  intent: Intent;
  /** What the user sees. */
  summary: string;
  /** Concrete effects, one per line. Empty for answer/unclear. */
  effects: string[];
  /** Whether there is anything to apply. */
  actionable: boolean;
  /** Whether apply will call a model (and so take a few seconds). */
  callsModel: boolean;
}

export interface Applied {
  summary: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export async function loadContext(userId: string): Promise<CoordinatorContext> {
  const now = new Date();
  const { start, end } = getWeekRange(now);
  const [goals, tasks] = await Promise.all([
    prisma.goal.findMany({
      where: { userId },
      include: { milestones: { where: { status: "active" }, take: 1 } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.task.findMany({
      where: { goal: { userId }, date: { gte: start, lte: end } },
      select: { id: true, title: true, date: true, status: true, goalId: true },
      orderBy: [{ date: "asc" }, { scheduledStart: "asc" }],
    }),
  ]);
  return {
    todayISO: toISODate(now),
    weekStartISO: toISODate(start),
    weekEndISO: toISODate(end),
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      activeMilestone: g.milestones[0]?.title ?? null,
      progress: g.progress,
    })),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, date: toISODate(t.date), status: t.status, goalId: t.goalId })),
  };
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${d.getUTCDate()}`;
}

function goalOf(intent: Intent, ctx: CoordinatorContext) {
  return ctx.goals.find((g) => g.id === intent.goalId) ?? null;
}

export function preview(intent: Intent, ctx: CoordinatorContext): Proposal {
  const base = { intent, summary: intent.message, effects: [] as string[], actionable: true, callsModel: false };
  const pending = (filter: (t: CoordinatorContext["tasks"][number]) => boolean) =>
    ctx.tasks.filter((t) => t.status === TASK_STATUS.pending && filter(t));
  const remainingDays = (fromISO: string) => {
    const days: string[] = [];
    let d = fromISO;
    while (d <= ctx.weekEndISO) {
      days.push(d);
      const n = new Date(`${d}T00:00:00Z`);
      n.setUTCDate(n.getUTCDate() + 1);
      d = n.toISOString().slice(0, 10);
    }
    return days;
  };

  switch (intent.action) {
    case "clear_day": {
      const date = intent.date!;
      const skipped = pending((t) => t.date === date);
      const rest = remainingDays(date).slice(1);
      return {
        ...base,
        callsModel: rest.length > 0,
        effects: [
          skipped.length
            ? `Mark ${skipped.length} task${skipped.length === 1 ? "" : "s"} on ${dayLabel(date)} as skipped: ${skipped.map((t) => t.title).join(", ")}`
            : `Nothing pending on ${dayLabel(date)}`,
          rest.length
            ? `Re-lay ${dayLabel(rest[0])}–${dayLabel(rest[rest.length - 1])} so the skipped work is picked up where there's room`
            : "No days left this week to move the work into",
        ],
      };
    }
    case "replan_week": {
      const from = ctx.todayISO > ctx.weekStartISO ? ctx.todayISO : ctx.weekStartISO;
      const replaced = pending((t) => t.date >= from);
      return {
        ...base,
        callsModel: true,
        effects: [
          `Replace ${replaced.length} unfinished task${replaced.length === 1 ? "" : "s"} from ${dayLabel(from)} to ${dayLabel(ctx.weekEndISO)}`,
          "Finished and skipped tasks stay where they are",
        ],
      };
    }
    case "pause_goal": {
      const g = goalOf(intent, ctx)!;
      const removed = pending((t) => t.goalId === g.id && t.date >= ctx.todayISO);
      return {
        ...base,
        callsModel: true,
        effects: [
          `Pause "${g.title}" — nothing new is scheduled for it until you resume`,
          removed.length ? `Remove its ${removed.length} remaining task${removed.length === 1 ? "" : "s"} this week` : "It has no remaining tasks this week",
          "Re-lay the rest of the week across your other goals",
        ],
      };
    }
    case "resume_goal": {
      const g = goalOf(intent, ctx)!;
      return {
        ...base,
        callsModel: true,
        effects: [`Resume "${g.title}"`, "Re-lay the rest of the week so it gets time again"],
      };
    }
    case "skip_task":
    case "complete_task": {
      const t = ctx.tasks.find((t) => t.id === intent.taskId)!;
      return {
        ...base,
        effects: [`Mark "${t.title}" (${dayLabel(t.date)}) as ${intent.action === "skip_task" ? "skipped" : "done"}`],
      };
    }
    case "review_goal": {
      const g = goalOf(intent, ctx)!;
      return {
        ...base,
        callsModel: true,
        effects: [`Run the weekly review for "${g.title}"`, "Update its progress, current milestone, and this week's focus"],
      };
    }
    case "revise_roadmap": {
      const g = goalOf(intent, ctx)!;
      return {
        ...base,
        callsModel: true,
        effects: [`Ask the planner to revise the roadmap for "${g.title}": “${intent.request}”`, "Then re-lay the rest of the week against the new roadmap"],
      };
    }
    case "answer":
    case "unclear":
      return { ...base, actionable: false };
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/** Re-lay [fromISO, weekEnd]. Skips days that are already past. */
async function replanFrom(userId: string, fromISO: string, ctx: CoordinatorContext) {
  const from = fromISO > ctx.todayISO ? fromISO : ctx.todayISO;
  if (from > ctx.weekEndISO) return { created: 0 };
  return runScheduler(userId, fromISODate(from), fromISODate(ctx.weekEndISO));
}

export async function apply(intent: Intent, ctx: CoordinatorContext, userId: string): Promise<Applied> {
  const goalIds = ctx.goals.map((g) => g.id);

  switch (intent.action) {
    case "clear_day": {
      const date = intent.date!;
      const { count } = await prisma.task.updateMany({
        where: { goalId: { in: goalIds }, date: fromISODate(date), status: TASK_STATUS.pending },
        data: { status: TASK_STATUS.skipped },
      });
      const next = new Date(`${date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const r = await replanFrom(userId, next.toISOString().slice(0, 10), ctx);
      return {
        summary: `Skipped ${count} task${count === 1 ? "" : "s"} on ${dayLabel(date)}${r.created ? ` and placed ${r.created} into the rest of the week` : ""}.`,
      };
    }
    case "replan_week": {
      const r = await replanFrom(userId, ctx.weekStartISO, ctx);
      return { summary: `Placed ${r.created} task${r.created === 1 ? "" : "s"} into the rest of the week.` };
    }
    case "pause_goal": {
      const g = ctx.goals.find((x) => x.id === intent.goalId)!;
      await prisma.goal.update({ where: { id: g.id }, data: { status: "paused" } });
      await prisma.task.deleteMany({
        where: { goalId: g.id, date: { gte: fromISODate(ctx.todayISO) }, status: TASK_STATUS.pending },
      });
      await replanFrom(userId, ctx.todayISO, ctx);
      return { summary: `Paused "${g.title}" and re-laid the rest of the week.` };
    }
    case "resume_goal": {
      const g = ctx.goals.find((x) => x.id === intent.goalId)!;
      await prisma.goal.update({ where: { id: g.id }, data: { status: "active" } });
      const r = await replanFrom(userId, ctx.todayISO, ctx);
      return { summary: `Resumed "${g.title}"${r.created ? ` and placed ${r.created} tasks` : ""}.` };
    }
    case "skip_task":
    case "complete_task": {
      const t = ctx.tasks.find((x) => x.id === intent.taskId)!;
      const done = intent.action === "complete_task";
      await prisma.task.update({
        where: { id: t.id },
        data: { status: done ? TASK_STATUS.done : TASK_STATUS.skipped, completedAt: done ? new Date() : null },
      });
      return { summary: `Marked "${t.title}" as ${done ? "done" : "skipped"}.` };
    }
    case "review_goal": {
      const g = ctx.goals.find((x) => x.id === intent.goalId)!;
      const { data } = await runReview(userId, g.id);
      return { summary: `${g.title}: ${data.progressPercent}%. ${data.summary}` };
    }
    case "revise_roadmap": {
      const g = ctx.goals.find((x) => x.id === intent.goalId)!;
      const { data } = await reviseRoadmap(userId, g.id, intent.request!);
      await replanFrom(userId, ctx.todayISO, ctx);
      return { summary: `Revised "${g.title}" into ${data.milestones.length} milestones and re-laid the week.` };
    }
    case "answer":
    case "unclear":
      return { summary: intent.message };
  }
}
