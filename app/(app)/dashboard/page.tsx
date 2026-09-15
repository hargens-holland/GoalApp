import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getWeekRange, getWeekInfo, toISODate } from "@/lib/dates";
import { isDone, serializeTask } from "@/lib/tasks";
import { getAvailability } from "@/lib/scheduling";
import WeekView, { type GoalSummary, type WeekData } from "@/components/WeekView";

/**
 * The week is the home page. Everything the client needs for the current week
 * is loaded here and handed over, so the first paint is complete; navigating
 * to other weeks fetches from /api/schedule.
 */
export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { start, end } = getWeekRange();
  const now = new Date();

  const [goals, tasks, availability, allTasks] = await Promise.all([
    prisma.goal.findMany({
      where: { userId, status: "active" },
      include: { milestones: { where: { status: "active" }, orderBy: { order: "asc" }, take: 1 } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.task.findMany({
      where: { goal: { userId }, date: { gte: start, lte: end } },
      include: { goal: { select: { id: true, title: true, hue: true } } },
      orderBy: [{ date: "asc" }, { scheduledStart: "asc" }, { order: "asc" }],
    }),
    getAvailability(userId, start, end),
    // For the streak. Loads every task the user has; fine at this scale, and
    // noted in the README as the first thing to make a windowed query.
    prisma.task.findMany({
      where: { goal: { userId }, date: { lt: start } },
      select: { date: true, status: true },
    }),
  ]);

  // Streak: consecutive past weeks, ending last week, with ≥ 50% completion.
  const byWeek = new Map<string, { total: number; done: number }>();
  for (const t of allTasks) {
    const { weekNumber, year } = getWeekInfo(t.date);
    const key = `${year}-${String(weekNumber).padStart(2, "0")}`;
    const cur = byWeek.get(key) ?? { total: 0, done: 0 };
    cur.total++;
    if (isDone(t.status)) cur.done++;
    byWeek.set(key, cur);
  }
  let streak = 0;
  const cursor = new Date(start);
  for (;;) {
    cursor.setUTCDate(cursor.getUTCDate() - 7);
    const { weekNumber, year } = getWeekInfo(cursor);
    const w = byWeek.get(`${year}-${String(weekNumber).padStart(2, "0")}`);
    if (w && w.total > 0 && w.done / w.total >= 0.5) streak++;
    else break;
  }

  const initial: WeekData = {
    start: start.toISOString(),
    end: end.toISOString(),
    availability,
    tasks: tasks.map((t) => {
      const s = serializeTask(t);
      return {
        id: s.id,
        title: s.title,
        description: s.description,
        date: s.date.toISOString(),
        scheduledStart: s.scheduledStart?.toISOString() ?? null,
        scheduledEnd: s.scheduledEnd?.toISOString() ?? null,
        estimatedMinutes: s.estimatedMinutes,
        completed: s.completed,
        notes: s.notes,
        goal: s.goal,
      };
    }),
  };

  const summaries: GoalSummary[] = goals.map((g) => ({
    id: g.id,
    title: g.title,
    hue: g.hue,
    progress: g.progress,
    activeMilestone: g.milestones[0]?.title ?? null,
  }));

  return <WeekView initial={initial} goals={summaries} streak={streak} todayISO={toISODate(now)} />;
}
