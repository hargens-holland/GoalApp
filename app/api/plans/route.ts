import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWeekInfo } from "@/lib/ai";
import { Prisma } from "@prisma/client";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { weekNumber, year } = getWeekInfo();

  const plans = await prisma.plan.findMany({
    where: { userId: session.user.id },
    include: {
      tasks: {
        where: { weekNumber, year },
        orderBy: { order: "asc" },
        include: {
          completions: {
            include: { weeklySnapshot: true },
            where: { weeklySnapshot: { weekNumber, year } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(plans);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, goal, clarifications } = await request.json() as {
    title?: string;
    goal?: string;
    clarifications?: unknown[];
  };

  if (!title || !goal) {
    return NextResponse.json({ error: "Title and goal are required" }, { status: 400 });
  }

  const plan = await prisma.plan.create({
    data: {
      title,
      goal,
      clarifications: (clarifications ?? []) as unknown as Prisma.InputJsonValue,
      userId: session.user.id,
    },
  });

  return NextResponse.json(plan, { status: 201 });
}
