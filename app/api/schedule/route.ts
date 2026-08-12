import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWeekRange } from "@/lib/agents/shared";
import { runScheduler } from "@/lib/planning";

function rangeForOffset(weekOffset: number) {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + weekOffset * 7);
  return getWeekRange(base);
}

// Read the dated tasks for a week across all the user's goals (the calendar).
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const weekOffset = Number(
    new URL(request.url).searchParams.get("weekOffset") ?? "0"
  );
  const { start, end } = rangeForOffset(Number.isFinite(weekOffset) ? weekOffset : 0);

  const tasks = await prisma.task.findMany({
    where: { goal: { userId: session.user.id }, date: { gte: start, lte: end } },
    include: { goal: { select: { id: true, title: true } } },
    orderBy: [{ date: "asc" }, { scheduledStart: "asc" }, { order: "asc" }],
  });

  return NextResponse.json({
    start: start.toISOString(),
    end: end.toISOString(),
    tasks,
  });
}

// Scheduler agent: (re)generate the week's tasks across all active goals.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { weekOffset } = (await request.json().catch(() => ({}))) as {
    weekOffset?: number;
  };
  const { start, end } = rangeForOffset(weekOffset ?? 0);

  const result = await runScheduler(session.user.id, start, end);
  return NextResponse.json(result);
}
