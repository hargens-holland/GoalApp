import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWeekInfo } from "@/lib/ai";
import { Prisma } from "@prisma/client";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    planId?: string;
    taskId?: string;
    completed?: boolean;
    notes?: string;
    metadata?: Record<string, unknown>;
  };

  const { planId, taskId, completed, notes, metadata } = body;

  if (!planId || !taskId) {
    return NextResponse.json({ error: "planId and taskId are required" }, { status: 400 });
  }

  // Verify the plan belongs to this user
  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId: session.user.id },
  });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const { weekNumber, year } = getWeekInfo();

  // Upsert the weekly snapshot
  const snapshot = await prisma.weeklySnapshot.upsert({
    where: { planId_weekNumber_year: { planId, weekNumber, year } },
    update: {},
    create: { planId, weekNumber, year },
  });

  // Upsert the task completion
  const completion = await prisma.taskCompletion.upsert({
    where: { taskId_weeklySnapshotId: { taskId, weeklySnapshotId: snapshot.id } },
    update: {
      completed: completed ?? false,
      notes: notes ?? null,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      completedAt: completed ? new Date() : null,
    },
    create: {
      taskId,
      weeklySnapshotId: snapshot.id,
      completed: completed ?? false,
      notes: notes ?? null,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      completedAt: completed ? new Date() : null,
    },
  });

  return NextResponse.json(completion);
}
