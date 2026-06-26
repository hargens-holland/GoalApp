import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { adjustPlan, getWeekInfo } from "@/lib/ai";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plan = await prisma.plan.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const { adjustment } = await request.json() as { adjustment?: string };
  if (!adjustment?.trim()) {
    return NextResponse.json({ error: "adjustment text is required" }, { status: 400 });
  }

  const { weekNumber, year } = getWeekInfo();

  const currentTasks = await prisma.task.findMany({
    where: { planId: params.id, weekNumber, year },
    orderBy: { order: "asc" },
  });

  const generated = await adjustPlan(
    plan.goal,
    currentTasks.map((t) => ({ title: t.title, description: t.description ?? "" })),
    adjustment
  );

  // Delete current week's tasks and replace
  await prisma.task.deleteMany({
    where: { planId: params.id, weekNumber, year },
  });

  const newTasks = await Promise.all(
    generated.tasks.map((t) =>
      prisma.task.create({
        data: {
          title: t.title,
          description: t.description,
          planId: params.id,
          weekNumber,
          year,
          order: t.order,
        },
      })
    )
  );

  return NextResponse.json(newTasks);
}
