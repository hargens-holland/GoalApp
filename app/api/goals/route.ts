import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { generateRoadmap } from "@/lib/agents/architect";
import { getWeekRange, Clarification } from "@/lib/agents/shared";
import { runScheduler } from "@/lib/planning";

// List the user's goals with their roadmap and this week's tasks.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { start, end } = getWeekRange();
  const goals = await prisma.goal.findMany({
    where: { userId: session.user.id },
    include: {
      milestones: { orderBy: { order: "asc" } },
      tasks: { where: { date: { gte: start, lte: end } }, orderBy: [{ date: "asc" }, { order: "asc" }] },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(goals);
}

// Create a goal and its roadmap (Architect), then lay out this week (Scheduler).
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { goal, clarifications } = (await request.json()) as {
    goal?: string;
    clarifications?: Clarification[];
  };
  if (!goal?.trim()) {
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  }

  const qaList = clarifications ?? [];
  const roadmap = await generateRoadmap(goal, qaList);
  const title = goal.length > 60 ? goal.slice(0, 57) + "…" : goal;

  const created = await prisma.goal.create({
    data: {
      title,
      goal,
      clarifications: qaList as unknown as Prisma.InputJsonValue,
      userId: session.user.id,
      milestones: {
        create: roadmap.milestones
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
    include: { milestones: true },
  });

  // Lay out the current week across all of the user's active goals.
  const { start, end } = getWeekRange();
  await runScheduler(session.user.id, start, end);

  return NextResponse.json({ goalId: created.id, goal: created }, { status: 201 });
}
