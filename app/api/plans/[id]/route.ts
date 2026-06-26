import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWeekInfo } from "@/lib/ai";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { weekNumber, year } = getWeekInfo();

  const plan = await prisma.plan.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      tasks: {
        where: { weekNumber, year },
        orderBy: { order: "asc" },
        include: {
          completions: {
            where: { weeklySnapshot: { weekNumber, year, planId: params.id } },
          },
        },
      },
      weeklySnapshots: {
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          completions: {
            include: { task: true },
          },
        },
      },
    },
  });

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  return NextResponse.json(plan);
}

export async function PUT(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as { title?: string; goal?: string };

  const plan = await prisma.plan.findFirst({
    where: { id: params.id, userId: session.user.id },
  });

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const updated = await prisma.plan.update({
    where: { id: params.id },
    data: {
      ...(body.title && { title: body.title }),
      ...(body.goal && { goal: body.goal }),
    },
  });

  return NextResponse.json(updated);
}
