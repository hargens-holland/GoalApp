import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWeekInfo } from "@/lib/ai";

type Params = { params: { id: string } };

export async function GET(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plan = await prisma.plan.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const url = new URL(request.url);
  const weekParam = url.searchParams.get("week");
  const yearParam = url.searchParams.get("year");
  const { weekNumber, year } = getWeekInfo();

  const tasks = await prisma.task.findMany({
    where: {
      planId: params.id,
      weekNumber: weekParam ? parseInt(weekParam) : weekNumber,
      year: yearParam ? parseInt(yearParam) : year,
    },
    orderBy: { order: "asc" },
    include: {
      completions: true,
    },
  });

  return NextResponse.json(tasks);
}

export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plan = await prisma.plan.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const body = await request.json() as {
    tasks?: Array<{ title: string; description?: string; order?: number }>;
    weekNumber?: number;
    year?: number;
  };

  const { weekNumber, year } = getWeekInfo();
  const targetWeek = body.weekNumber ?? weekNumber;
  const targetYear = body.year ?? year;

  if (!body.tasks?.length) {
    return NextResponse.json({ error: "tasks array is required" }, { status: 400 });
  }

  const created = await Promise.all(
    body.tasks.map((t, i) =>
      prisma.task.create({
        data: {
          title: t.title,
          description: t.description,
          planId: params.id,
          weekNumber: targetWeek,
          year: targetYear,
          order: t.order ?? i,
        },
      })
    )
  );

  return NextResponse.json(created, { status: 201 });
}
