import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWeekRange } from "@/lib/dates";
import { serializeTask } from "@/lib/tasks";
import { getAvailability, runScheduler } from "@/lib/scheduling";

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

  const [tasks, availability] = await Promise.all([
    prisma.task.findMany({
      where: { goal: { userId: session.user.id }, date: { gte: start, lte: end } },
      include: { goal: { select: { id: true, title: true, hue: true } } },
      orderBy: [{ date: "asc" }, { scheduledStart: "asc" }, { order: "asc" }],
    }),
    // The week view draws the user's free windows behind the tasks, so the
    // reader can see that every task sits inside one.
    getAvailability(session.user.id, start, end),
  ]);

  return NextResponse.json({
    start: start.toISOString(),
    end: end.toISOString(),
    // `completed` is derived from status on the way out — see lib/tasks.ts.
    tasks: tasks.map(serializeTask),
    availability,
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
