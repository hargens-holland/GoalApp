import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { adjustRoadmap } from "@/lib/agents/architect";
import { getWeekRange } from "@/lib/dates";
import { serializeGoalTasks } from "@/lib/tasks";
import { runScheduler } from "@/lib/scheduling";

/**
 * The "editor". scope="roadmap" → Architect revises the milestones, then the
 * week is re-laid-out. scope="week" (default) → Scheduler just rebalances the
 * current week across all active goals.
 */
export async function POST(
  request: Request,
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

  const { request: req, scope } = (await request.json()) as {
    request?: string;
    scope?: "roadmap" | "week";
  };

  if (scope === "roadmap") {
    if (!req?.trim()) {
      return NextResponse.json({ error: "request is required" }, { status: 400 });
    }
    const { data: revised } = await adjustRoadmap(
      goal.goal,
      goal.milestones.map((m) => ({ title: m.title, description: m.description ?? "", order: m.order })),
      req
    );
    // Replace the roadmap. Tasks point at milestones via SetNull, so they survive.
    await prisma.milestone.deleteMany({ where: { goalId: goal.id } });
    await prisma.goal.update({
      where: { id: goal.id },
      data: {
        milestones: {
          create: revised.milestones
            .sort((a, b) => a.order - b.order)
            .map((m, i) => ({
              title: m.title,
              description: m.description,
              successCriteria: m.successCriteria,
              order: i,
              targetWeekOffset: m.targetWeekOffset,
              status: i === 0 ? "active" : "locked",
            })),
        },
      },
    });
  }

  const { start, end } = getWeekRange();
  await runScheduler(session.user.id, start, end);

  const updated = await prisma.goal.findUnique({
    where: { id: goal.id },
    include: {
      milestones: { orderBy: { order: "asc" } },
      tasks: { where: { date: { gte: start, lte: end } }, orderBy: [{ date: "asc" }, { order: "asc" }] },
    },
  });
  return NextResponse.json(updated ? serializeGoalTasks(updated) : updated);
}
