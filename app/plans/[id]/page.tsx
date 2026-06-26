import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getWeekInfo } from "@/lib/ai";
import Link from "next/link";
import { TaskList } from "@/components/TaskList";
import { StatsView } from "@/components/StatsView";
import PlanActions from "@/components/PlanActions";

export default async function PlanDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

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
        include: { completions: { include: { task: true } } },
      },
    },
  });

  if (!plan) notFound();

  const totalTasks = plan.tasks.length;
  const completedTasks = plan.tasks.filter((t) => t.completions.some((c) => c.completed)).length;
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const snapshots = plan.weeklySnapshots.map((s) => {
    const total = s.completions.length;
    const done = s.completions.filter((c) => c.completed).length;
    return { weekNumber: s.weekNumber, year: s.year, total, done, rate: total > 0 ? done / total : 0 };
  });

  let streak = 0;
  for (const snap of snapshots) {
    if (snap.rate >= 0.5) streak++;
    else break;
  }

  const recentNotes = plan.weeklySnapshots
    .flatMap((s) => s.completions.filter((c) => c.notes))
    .slice(0, 5)
    .map((c) => ({ taskTitle: c.task.title, note: c.notes! }));

  const serializedTasks = plan.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    order: t.order,
    completed: t.completions.some((c) => c.completed),
    completionId: t.completions[0]?.id ?? null,
    notes: t.completions[0]?.notes ?? "",
    metadata: (t.completions[0]?.metadata ?? null) as Record<string, unknown> | null,
  }));

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/dashboard" className="btn-ghost text-sm px-2 shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Plans
            </Link>
            <span className="text-zinc-800">|</span>
            <h1 className="text-sm font-semibold text-white truncate">{plan.title}</h1>
            <span className="text-xs text-zinc-600 shrink-0 hidden sm:block">Week {weekNumber}</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {totalTasks > 0 && (
              <>
                <span className="text-xs text-zinc-500 tabular-nums">{pct}%</span>
                <div className="w-20 h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: goal + tasks + actions */}
        <div className="lg:col-span-2 space-y-4">
          {/* Goal */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Goal</p>
            <p className="text-sm text-zinc-200 leading-relaxed">{plan.goal}</p>
          </div>

          {/* Tasks */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">This week&apos;s tasks</h2>
              {totalTasks > 0 && (
                <span className="text-xs text-zinc-500">{completedTasks}/{totalTasks}</span>
              )}
            </div>
            <div className="p-4">
              {plan.tasks.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-zinc-600">No tasks for this week.</p>
                  <p className="text-xs text-zinc-700 mt-1">Use &quot;Generate next week&quot; below to create tasks.</p>
                </div>
              ) : (
                <TaskList planId={plan.id} tasks={serializedTasks} />
              )}
            </div>
          </div>

          <PlanActions planId={plan.id} hasLastWeek={plan.weeklySnapshots.length > 0} />
        </div>

        {/* Right: stats */}
        <div>
          <StatsView
            totalTasks={totalTasks}
            completedTasks={completedTasks}
            streak={streak}
            snapshots={snapshots}
            recentNotes={recentNotes}
          />
        </div>
      </main>
    </div>
  );
}
