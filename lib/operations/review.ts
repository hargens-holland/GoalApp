import { prisma } from "@/lib/prisma";
import { assessProgress } from "@/lib/agents/progress";
import type { AgentOutcome } from "@/lib/agents/client";
import type { ProgressAssessment } from "@/lib/agents/schemas";
import { getWeekInfo } from "@/lib/dates";
import { isDone } from "@/lib/tasks";

/**
 * Run the weekly review for one goal: Progress agent → milestone statuses →
 * goal.progress → this week's snapshot. Shared by the review route and the
 * coordinator so "review my Spanish" and the button do exactly the same thing.
 *
 * The goal must already be known to belong to the caller.
 */
export async function runReview(userId: string, goalId: string): Promise<AgentOutcome<ProgressAssessment>> {
  const goal = await prisma.goal.findUniqueOrThrow({
    where: { id: goalId },
    include: { milestones: { orderBy: { order: "asc" } } },
  });

  // Recent task results (last 14 days) feed the assessment.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 14);
  const recent = await prisma.task.findMany({
    where: { goalId: goal.id, date: { gte: since } },
    select: { title: true, status: true, notes: true },
  });

  const outcome = await assessProgress(
    goal.goal,
    goal.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      successCriteria: m.successCriteria,
      order: m.order,
      status: m.status,
    })),
    recent.map((t) => ({ title: t.title, completed: isDone(t.status), notes: t.notes })),
    { userId }
  );
  const assessment = outcome.data;

  // Apply milestone statuses: completed → done, current → active, rest → locked.
  const done = new Set(assessment.completedMilestoneIds);
  await Promise.all(
    goal.milestones.map((m) =>
      prisma.milestone.update({
        where: { id: m.id },
        data: {
          status: done.has(m.id)
            ? "done"
            : m.id === assessment.currentMilestoneId
              ? "active"
              : m.status === "active"
                ? "locked"
                : m.status,
        },
      })
    )
  );

  await prisma.goal.update({ where: { id: goal.id }, data: { progress: assessment.progressPercent } });

  const { weekNumber, year } = getWeekInfo();
  await prisma.progressSnapshot.upsert({
    where: { goalId_weekNumber_year: { goalId: goal.id, weekNumber, year } },
    create: {
      goalId: goal.id,
      weekNumber,
      year,
      summary: assessment.summary,
      focusForWeek: assessment.focusForWeek,
      currentMilestoneId: assessment.currentMilestoneId,
    },
    update: {
      summary: assessment.summary,
      focusForWeek: assessment.focusForWeek,
      currentMilestoneId: assessment.currentMilestoneId,
    },
  });

  return outcome;
}
