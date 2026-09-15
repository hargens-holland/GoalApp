import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getWeekRange, getWeekInfo } from "@/lib/dates";
import { goalColor } from "@/lib/colors";
import { isDone } from "@/lib/tasks";
import { shortDow, timeFromISO } from "@/lib/format";
import GoalDetailActions from "@/components/GoalDetailActions";
import CompactTaskList, { type CompactTask } from "@/components/CompactTaskList";
import RoadmapTimeline from "@/components/RoadmapTimeline";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function GoalDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { start, end } = getWeekRange();
  const goal = await prisma.goal.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      milestones: { orderBy: { order: "asc" } },
      tasks: { where: { date: { gte: start, lte: end } }, orderBy: [{ date: "asc" }, { order: "asc" }] },
      snapshots: { orderBy: [{ year: "desc" }, { weekNumber: "desc" }], take: 1 },
    },
  });
  if (!goal) notFound();

  const color = goalColor(goal.hue);
  const latest = goal.snapshots[0];
  const active = goal.milestones.find((m) => m.status === "active");
  const doneMilestones = goal.milestones.filter((m) => m.status === "done").length;
  const weeksElapsed = Math.max(0, Math.floor((Date.now() - goal.createdAt.getTime()) / WEEK_MS));

  // Completion rate per ISO week over the last eight, from this goal's tasks.
  const allTasks = await prisma.task.findMany({
    where: { goalId: goal.id },
    select: { date: true, status: true },
  });
  const rateByWeek = new Map<string, { total: number; done: number }>();
  for (const t of allTasks) {
    const { weekNumber, year } = getWeekInfo(t.date);
    const key = `${year}-${String(weekNumber).padStart(2, "0")}`;
    const c = rateByWeek.get(key) ?? { total: 0, done: 0 };
    c.total++;
    if (isDone(t.status)) c.done++;
    rateByWeek.set(key, c);
  }
  const history: (number | null)[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i * 7);
    const { weekNumber, year } = getWeekInfo(d);
    const c = rateByWeek.get(`${year}-${String(weekNumber).padStart(2, "0")}`);
    history.push(c && c.total ? c.done / c.total : null);
  }

  const weekTasks: CompactTask[] = goal.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    day: `${shortDow(t.date.getUTCDay())} ${t.date.getUTCDate()}`,
    time: timeFromISO(t.scheduledStart?.toISOString() ?? null),
    completed: isDone(t.status),
  }));

  const focus =
    latest?.focusForWeek ?? active?.description ?? "Run a weekly review to set this week's focus.";

  return (
    <div>
      <Link href="/dashboard" className="btn-text text-[13px]">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4 L5 8 L9 12" /><line x1="5" y1="8" x2="13" y2="8" /></svg>
        Week
      </Link>

      {/* Title ---------------------------------------------------------- */}
      <div className="mt-5 flex items-start justify-between gap-8">
        <div className="min-w-0">
          <div className="flex items-center gap-[9px]">
            <span className="h-[9px] w-[9px] rounded-full" style={{ background: color }} />
            <span className="eyebrow">
              {goal.status === "active" ? `Week ${weeksElapsed + 1}` : goal.status}
              {" · "}
              {doneMilestones} of {goal.milestones.length} milestones
            </span>
          </div>
          <h1 className="display mt-2 text-[40px] leading-[1.05]">{goal.title}</h1>
          <p className="mt-3 max-w-[600px] text-[16px] leading-[1.5] text-ink-2">{goal.goal}</p>
        </div>
        <GoalDetailActions goalId={goal.id} />
      </div>

      {/* Focus ---------------------------------------------------------- */}
      <div className="mt-8 border-l-2 pl-4" style={{ borderColor: color }}>
        <div className="eyebrow">This week</div>
        <p className="mt-1 text-[17px] leading-[1.45] text-ink">{focus}</p>
        {latest?.summary && <p className="mt-2 text-[14px] leading-[1.5] text-ink-3">{latest.summary}</p>}
      </div>

      {/* Body ----------------------------------------------------------- */}
      <div className="mt-12 grid grid-cols-1 gap-x-14 gap-y-12 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <h2 className="display text-[26px]">Roadmap</h2>
          <RoadmapTimeline milestones={goal.milestones} hue={goal.hue} weeksElapsed={weeksElapsed} />
        </section>

        <div className="flex flex-col gap-10">
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="display text-[26px]">Progress</h2>
              <span className="font-mono text-[13px] text-ink-2">{goal.progress}%</span>
            </div>
            <div className="mt-3 h-px bg-paper-3">
              <div className="h-px" style={{ width: `${goal.progress}%`, background: color }} />
            </div>

            <div className="mt-6 flex items-baseline justify-between">
              <span className="eyebrow">Weekly completion</span>
              <span className="font-mono text-[10.5px] text-ink-4">8 wks</span>
            </div>
            <div className="mt-3 flex h-[56px] items-end gap-[5px]">
              {history.map((rate, i) => (
                <div key={i} className="flex flex-1 flex-col justify-end" style={{ height: "100%" }}>
                  {rate == null ? (
                    <div className="h-px bg-paper-3" />
                  ) : (
                    <div
                      className="rounded-sm"
                      style={{ height: `${Math.max(3, rate * 56)}px`, background: color, opacity: i === history.length - 1 ? 1 : 0.55 }}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="display text-[26px]">This week</h2>
            <div className="mt-3">
              <CompactTaskList tasks={weekTasks} hue={goal.hue} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
