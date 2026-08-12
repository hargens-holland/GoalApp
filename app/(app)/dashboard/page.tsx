import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getWeekRange, getWeekInfo, toISODate } from "@/lib/agents/shared";
import { goalColor } from "@/lib/colors";
import { dateLabel, greeting, timeFromISO } from "@/lib/format";
import DashboardToday, { TodayTask } from "@/components/DashboardToday";

function StatCard({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub: string }) {
  return (
    <div className="rounded-[15px] border border-[rgba(255,255,255,0.06)] bg-card px-[18px] py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">{label}</div>
      <div className="mt-[7px] flex items-baseline gap-[5px]">
        <span className="font-mono text-[26px] font-bold">{value}</span>
        {unit && <span className="font-mono text-[15px] font-medium text-ink-3">{unit}</span>}
      </div>
      <div className="mt-0.5 text-[12.5px] text-ink-3">{sub}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { weekNumber } = getWeekInfo();
  const { start, end } = getWeekRange();
  const now = new Date();
  const todayISO = toISODate(now);

  const goals = await prisma.goal.findMany({
    where: { userId: session.user.id },
    include: {
      milestones: { orderBy: { order: "asc" } },
      tasks: { where: { date: { gte: start, lte: end } }, orderBy: [{ date: "asc" }, { order: "asc" }] },
    },
    orderBy: { createdAt: "desc" },
  });

  // Streak: trailing consecutive past weeks (excluding current) with >=50% completion.
  const allTasks = await prisma.task.findMany({
    where: { goal: { userId: session.user.id } },
    select: { date: true, completed: true },
  });
  const byWeek = new Map<string, { total: number; done: number }>();
  for (const t of allTasks) {
    const { weekNumber: wn, year } = getWeekInfo(t.date);
    const key = `${year}-${String(wn).padStart(2, "0")}`;
    const cur = byWeek.get(key) ?? { total: 0, done: 0 };
    cur.total++;
    if (t.completed) cur.done++;
    byWeek.set(key, cur);
  }
  const currentKey = `${getWeekInfo().year}-${String(weekNumber).padStart(2, "0")}`;
  const pastWeeks = Array.from(byWeek.keys()).filter((k) => k < currentKey).sort().reverse();
  let streak = 0;
  for (const k of pastWeeks) {
    const w = byWeek.get(k)!;
    if (w.total > 0 && w.done / w.total >= 0.5) streak++;
    else break;
  }

  // This-week completion across all goals.
  const weekTasks = goals.flatMap((g) => g.tasks);
  const weekDone = weekTasks.filter((t) => t.completed).length;
  const weekPct = weekTasks.length ? Math.round((weekDone / weekTasks.length) * 100) : 0;
  const activeGoals = goals.filter((g) => g.status === "active").length;

  // Today's tasks across goals.
  const todayTasks: TodayTask[] = goals
    .flatMap((g) => g.tasks.filter((t) => toISODate(t.date) === todayISO).map((t) => ({ t, g })))
    .sort((a, b) => (a.t.scheduledStart?.toISOString() ?? "z").localeCompare(b.t.scheduledStart?.toISOString() ?? "z"))
    .map(({ t, g }) => ({
      id: t.id,
      title: t.title,
      desc: t.description ?? "",
      time: timeFromISO(t.scheduledStart?.toISOString() ?? null),
      completed: t.completed,
      notes: t.notes ?? "",
      goalTitle: g.title,
      color: goalColor(g.id),
    }));
  const todayDone = todayTasks.filter((t) => t.completed).length;

  return (
    <div>
      <div className="mb-[26px] flex items-end justify-between gap-4">
        <div>
          <div className="text-[26px] font-bold tracking-[-0.02em]">{greeting(now.getUTCHours())}</div>
          <div className="mt-[3px] text-[14px] text-ink-3">{dateLabel(now)}</div>
        </div>
        <div className="flex gap-[9px]">
          <Link href="/schedule" className="btn-ghost">Calendar</Link>
          <Link href="/goals/new" className="btn-primary">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" /></svg>
            New goal
          </Link>
        </div>
      </div>

      <div className="mb-[22px] grid grid-cols-2 gap-[14px] md:grid-cols-4">
        <StatCard label="Today" value={String(todayDone)} unit={`/ ${todayTasks.length}`} sub="tasks done" />
        <StatCard label="This week" value={String(weekPct)} unit="%" sub="completion" />
        <StatCard label="Streak" value={String(streak)} unit="wks" sub="≥50% each week" />
        <StatCard label="Active goals" value={String(activeGoals)} sub="in progress" />
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:[grid-template-columns:1.55fr_1fr]">
        <DashboardToday tasks={todayTasks} dateLabel={dateLabel(now)} />

        <div className="overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.06)] bg-card">
          <div className="flex items-center justify-between px-5 pb-[14px] pt-[18px]">
            <div className="text-[17px] font-bold tracking-[-0.01em]">Goals</div>
            <span className="text-[12.5px] text-ink-3">{activeGoals} active</span>
          </div>
          {goals.length === 0 ? (
            <div className="border-t border-[rgba(255,255,255,0.05)] px-5 py-10 text-center">
              <p className="mb-4 text-[13.5px] text-ink-3">No goals yet.</p>
              <Link href="/goals/new" className="btn-primary">Create your first goal</Link>
            </div>
          ) : (
            goals.map((g) => {
              const active = g.milestones.find((m) => m.status === "active");
              const color = goalColor(g.id);
              return (
                <Link key={g.id} href={`/goals/${g.id}`} className="block border-t border-[rgba(255,255,255,0.05)] px-5 py-[15px] transition-colors hover:bg-[rgba(255,255,255,0.018)]">
                  <div className="flex items-center gap-[10px]">
                    <span className="h-[9px] w-[9px] flex-shrink-0 rounded-full" style={{ background: color }} />
                    <span className="flex-1 truncate text-[14.5px] font-semibold text-ink">{g.title}</span>
                    <span className="font-mono text-[13px] text-ink-2">{g.progress}%</span>
                  </div>
                  <div className="ml-[19px] mt-[6px]">
                    <div className="truncate text-[12.5px] text-ink-3">{active?.title ?? "—"}</div>
                    <div className="mt-2 h-[6px] rounded-full bg-[rgba(255,255,255,0.07)]">
                      <div className="h-full rounded-full" style={{ width: `${g.progress}%`, background: color }} />
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
