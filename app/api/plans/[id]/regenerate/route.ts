import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { regeneratePlan, getWeekInfo } from "@/lib/ai";

type Params = { params: { id: string } };

export async function POST(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plan = await prisma.plan.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  // Get last week's snapshot
  const lastSnapshot = await prisma.weeklySnapshot.findFirst({
    where: { planId: params.id },
    orderBy: { createdAt: "desc" },
    include: {
      completions: { include: { task: true } },
    },
  });

  const completedTasks: string[] = [];
  const incompleteTasks: string[] = [];
  const notes: string[] = [];

  if (lastSnapshot) {
    for (const completion of lastSnapshot.completions) {
      if (completion.completed) {
        completedTasks.push(completion.task.title);
      } else {
        incompleteTasks.push(completion.task.title);
      }
      if (completion.notes) notes.push(completion.notes);
    }
  }

  const generated = await regeneratePlan(plan.goal, { completedTasks, incompleteTasks, notes });

  const { weekNumber, year } = getWeekInfo();
  // Compute next week
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + 7);
  const { weekNumber: nextWeek, year: nextYear } = getWeekInfo(nextDate);

  const tasks = await Promise.all(
    generated.tasks.map((t) =>
      prisma.task.create({
        data: {
          title: t.title,
          description: t.description,
          planId: params.id,
          weekNumber: nextWeek,
          year: nextYear,
          order: t.order,
        },
      })
    )
  );

  // Create next week's snapshot
  await prisma.weeklySnapshot.upsert({
    where: { planId_weekNumber_year: { planId: params.id, weekNumber: nextWeek, year: nextYear } },
    update: { summary: `Regenerated from week ${weekNumber}/${year}` },
    create: {
      planId: params.id,
      weekNumber: nextWeek,
      year: nextYear,
      summary: `Regenerated from week ${weekNumber}/${year}`,
    },
  });

  return NextResponse.json({ tasks, weekNumber: nextWeek, year: nextYear });
}
