import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateInitialPlan, getWeekInfo } from "@/lib/ai";
import { Prisma } from "@prisma/client";

interface Clarification {
  question: string;
  answer: string;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { goal, clarifications } = await request.json() as {
    goal?: string;
    clarifications?: Clarification[];
  };

  if (!goal?.trim()) {
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  }

  const qaList = clarifications ?? [];
  const generated = await generateInitialPlan(goal, qaList);

  const { weekNumber, year } = getWeekInfo();

  // Derive a title from the goal (truncate at 60 chars)
  const title = goal.length > 60 ? goal.slice(0, 57) + "…" : goal;

  const plan = await prisma.plan.create({
    data: {
      title,
      goal,
      clarifications: qaList as unknown as Prisma.InputJsonValue,
      userId: session.user.id,
      tasks: {
        create: generated.tasks.map((t) => ({
          title: t.title,
          description: t.description,
          weekNumber,
          year,
          order: t.order,
        })),
      },
    },
    include: { tasks: true },
  });

  // Create the initial weekly snapshot
  await prisma.weeklySnapshot.create({
    data: { planId: plan.id, weekNumber, year },
  });

  return NextResponse.json({ planId: plan.id, plan }, { status: 201 });
}
