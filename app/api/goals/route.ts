import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { generateRoadmap } from "@/lib/agents/architect";
import { getWeekRange } from "@/lib/dates";
import type { Clarification } from "@/lib/agents/schemas";
import { serializeGoalTasks } from "@/lib/tasks";

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

  return NextResponse.json(goals.map(serializeGoalTasks));
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
  // Never throws: falls back to deterministic planning if the model is
  // unavailable, so goal creation always succeeds. `source` tells the client
  // whether this plan was model-generated.
  const { data: roadmap, source: roadmapSource } = await generateRoadmap(goal, qaList);
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

  // Scheduling is deliberately NOT run here.
  //
  // Creating a goal used to run the Architect and then the Scheduler in the same
  // request — two sequential model calls, comfortably the slowest path in the
  // app and capable of exceeding a serverless function's time limit on a slow
  // generation. The roadmap is what the user is waiting for, so it is returned
  // as soon as it exists; the client then calls POST /api/schedule to lay out
  // the week. That keeps each request to at most one model call.
  //
  // Splitting it this way also makes the failure modes independent: if
  // scheduling fails, the goal and its roadmap still exist and the week can be
  // generated later, rather than the whole creation failing.
  return NextResponse.json(
    {
      goalId: created.id,
      goal: created,
      planning: { roadmap: roadmapSource, schedule: "pending" as const },
    },
    { status: 201 }
  );
}
