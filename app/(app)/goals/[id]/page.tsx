import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getWeekRange, getWeekInfo, toISODate } from "@/lib/agents/shared";
import { goalColor, goalSoft } from "@/lib/colors";
import { timeFromISO } from "@/lib/format";
import GoalDetailActions from "@/components/GoalDetailActions";
import CompactTaskList, { CompactTask } from "@/components/CompactTaskList";

const STATUS_CHIP: Record<string, { label: string; chipBg: string; chipColor: string }> = {
  done: { label: "Done", chipBg: "rgba(52,211,153,0.14)", chipColor: "#34d399" },
  active: { label: "Active", chipBg: "rgba(109,86,240,0.16)", chipColor: "#a899ff" },
  locked: { label: "Upcoming", chipBg: "rgba(255,255,255,0.05)", chipColor: "#71717a" },
};

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

  const color = goalColor(goal.id);
  const soft = goalSoft(goal.id);
  const latest = goal.snapshots[0];
  const doneMiles = goal.milestones.filter((m) => m.status === "done").length;

  // Weekly history (last 8 ISO weeks) from this goal's task completion.
  const allTasks = await prisma.task.findMany({
    where: { goalId: goal.id },
    select: { date: true, completed: true },
  });
  const rateByWeek = new Map<string, { total: number; done: number }>();
  for (const t of allTasks) {
    const { weekNumber, year } = getWeekInfo(t.date);
    const key = `${year}-${String(weekNumber).padStart(2, "0")}`;
    const c = rateByWeek.get(key) ?? { total: 0, done: 0 };
    c.total++;
    if (t.completed) c.done++;
    rateByWeek.set(key, c);
  }
  const history: number[] = [];
  const cursor = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(cursor);
    d.setUTCDate(cursor.getUTCDate() - i * 7);
    const { weekNumber, year } = getWeekInfo(d);
    const key = `${year}-${String(weekNumber).padStart(2, "0")}`;
    const c = rateByWeek.get(key);
    history.push(c && c.total ? c.done / c.total : 0);
  }

  const compactTasks: CompactTask[] = goal.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    time: timeFromISO(t.scheduledStart?.toISOString() ?? null),
    completed: t.completed,
    color,
  }));

  return (
    <div>
      <Link href="/dashboard" className="mb-[18px] inline-flex items-center gap-[7px] text-[13px] font-medium text-ink-3 transition-colors hover:text-ink-2">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4 L5 8 L9 12" /><line x1="5" y1="8" x2="13" y2="8" /></svg>
        Dashboard
      </Link>

      <div className="mb-5 flex items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-[10px]">
            <span className="h-[11px] w-[11px] rounded-full" style={{ background: color }} />
            <span className="rounded-full px-[10px] py-[3px] text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color, background: soft }}>{goal.status}</span>
          </div>
          <div className="text-[27px] font-bold tracking-[-0.02em]">{goal.title}</div>
          <div className="mt-[5px] max-w-[560px] text-[15px] text-ink-2">{goal.goal}</div>
        </div>
        <GoalDetailActions goalId={goal.id} />
      </div>

      <div className="mb-[22px] rounded-[14px] border border-[rgba(255,255,255,0.06)] p-[15px_18px]" style={{ background: soft }}>
        <div className="mb-[5px] text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color }}>This week&apos;s focus</div>
        <div className="text-[14.5px] font-medium leading-[1.45] text-[#e4e4e7]">
          {latest?.focusForWeek ?? goal.milestones.find((m) => m.status === "active")?.description ?? "Set a focus by running a weekly review."}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:[grid-template-columns:1.5fr_1fr]">
        {/* Roadmap */}
        <div className="rounded-[16px] border border-[rgba(255,255,255,0.06)] bg-card p-[22px_24px]">
          <div className="mb-[18px] text-[16px] font-bold tracking-[-0.01em]">Roadmap</div>
          {goal.milestones.map((m, i) => {
            const chip = STATUS_CHIP[m.status] ?? STATUS_CHIP.locked;
            const notLast = i < goal.milestones.length - 1;
            const isDone = m.status === "done";
            const isActive = m.status === "active";
            return (
              <div key={m.id} className="flex gap-[15px]">
                <div className="flex flex-shrink-0 flex-col items-center">
                  <div
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[12px] font-bold text-white"
                    style={{
                      background: isDone ? color : "transparent",
                      border: `2px solid ${isDone || isActive ? color : "rgba(255,255,255,0.18)"}`,
                    }}
                  >
                    {isDone ? "✓" : isActive ? <span className="h-[9px] w-[9px] rounded-full" style={{ background: color }} /> : null}
                  </div>
                  {notLast && <div className="my-[3px] w-[2px] flex-1 bg-[rgba(255,255,255,0.08)]" style={{ minHeight: 34 }} />}
                </div>
                <div className="min-w-0 flex-1 pb-[22px]">
                  <div className="flex items-center gap-[9px]">
                    <span className="text-[15.5px] font-semibold" style={{ color: isDone || isActive ? "#f4f4f5" : "#a1a1aa" }}>{m.title}</span>
                    <span className="rounded-full px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-[0.03em]" style={{ color: chip.chipColor, background: chip.chipBg }}>{chip.label}</span>
                  </div>
                  {m.description && <div className="mt-1 text-[13.5px] leading-[1.45] text-ink-2">{m.description}</div>}
                  {m.successCriteria && (
                    <div className="mt-[9px] rounded-[9px] border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.03)] p-[8px_11px] text-[12.5px] text-ink-2">
                      <span className="text-ink-3">Success — </span>{m.successCriteria}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          <div className="rounded-[16px] border border-[rgba(255,255,255,0.06)] bg-card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">Overall progress</div>
            <div className="mt-2 flex items-baseline gap-[5px]">
              <span className="font-mono text-[34px] font-bold">{goal.progress}</span>
              <span className="font-mono text-[18px] font-semibold text-ink-3">%</span>
            </div>
            <div className="mt-[10px] h-2 rounded-full bg-[rgba(255,255,255,0.07)]">
              <div className="h-full rounded-full" style={{ width: `${goal.progress}%`, background: color }} />
            </div>
            <div className="mt-3 font-mono text-[13px] text-ink-2">{doneMiles} / {goal.milestones.length} milestones done</div>
            {latest?.summary && (
              <div className="mt-3 border-t border-[rgba(255,255,255,0.06)] pt-3 text-[13px] leading-[1.5] text-ink-3">{latest.summary}</div>
            )}
          </div>

          <div className="rounded-[16px] border border-[rgba(255,255,255,0.06)] bg-card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">Weekly progress</div>
            <div className="mt-[14px] flex h-[68px] items-end gap-[7px]">
              {history.map((rate, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-[4px]"
                  style={{ height: `${6 + rate * 56}px`, background: color, opacity: i === history.length - 1 ? 1 : 0.45 }}
                />
              ))}
            </div>
            <div className="mt-[7px] flex justify-between font-mono text-[10.5px] text-ink-4"><span>8 wks ago</span><span>now</span></div>
          </div>

          <div className="overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.06)] bg-card">
            <div className="p-[16px_18px_10px] text-[14px] font-semibold">This week&apos;s tasks</div>
            <CompactTaskList tasks={compactTasks} />
          </div>
        </div>
      </div>
    </div>
  );
}
