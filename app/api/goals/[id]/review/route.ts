import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assessProgress } from "@/lib/agents/progress";
import { getWeekInfo } from "@/lib/dates";
import { isDone } from "@/lib/tasks";

/**
 * PROGRESS agent endpoint. Assesses where the user is in the roadmap based on
 * recent task results, updates goal progress + milestone statuses, and records
 * a weekly ProgressSnapshot with the focus for the coming week. Cron-ready: a
 * scheduled job can POST this weekly with no logic change.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const goal = await prisma.goal.findUnique({
    where: { id: params.id },
    include: { milestones: { orderBy: { order: "asc" } } },
  });
  if (!goal || goal.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Recent task results (last 14 days) feed the assessment.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 14);
  const recent = await prisma.task.findMany({
    where: { goalId: goal.id, date: { gte: since } },
    select: { title: true, status: true, notes: true },
  });

  const { data: assessment, source } = await assessProgress(
    goal.goal,
    goal.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      successCriteria: m.successCriteria,
      order: m.order,
      status: m.status,
    })),
    recent.map((t) => ({ title: t.title, completed: isDone(t.status), notes: t.notes }))
  );

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

  await prisma.goal.update({
    where: { id: goal.id },
    data: { progress: assessment.progressPercent },
  });

  const { weekNumber, year } = getWeekInfo();
  const snapshot = await prisma.progressSnapshot.upsert({
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

  return NextResponse.json({ assessment, snapshot, source });
}
