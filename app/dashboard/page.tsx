import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getWeekInfo } from "@/lib/ai";
import Link from "next/link";
import { PlanCard } from "@/components/PlanCard";
import DashboardNav from "@/components/DashboardNav";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { weekNumber, year } = getWeekInfo();

  const plans = await prisma.plan.findMany({
    where: { userId: session.user.id },
    include: {
      tasks: {
        where: { weekNumber, year },
        orderBy: { order: "asc" },
        include: {
          completions: {
            where: { weeklySnapshot: { weekNumber, year } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalTasks = plans.reduce((a, p) => a + p.tasks.length, 0);
  const doneTasks = plans.reduce(
    (a, p) => a + p.tasks.filter((t) => t.completions.some((c) => c.completed)).length,
    0
  );

  return (
    <div className="min-h-screen bg-zinc-950">
      <DashboardNav userName={session.user.name ?? session.user.email} />

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-medium text-indigo-400 uppercase tracking-wider mb-1">
              Week {weekNumber} · {year}
            </p>
            <h1 className="text-2xl font-bold text-white">
              {session.user.name ? `${session.user.name.split(" ")[0]}'s plans` : "Your plans"}
            </h1>
            {totalTasks > 0 && (
              <p className="text-sm text-zinc-500 mt-1">
                {doneTasks} of {totalTasks} tasks complete this week
              </p>
            )}
          </div>
          <Link href="/plans/new" className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New plan
          </Link>
        </div>

        {/* Plan list */}
        {plans.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-16 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-800 mb-4">
              <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-white mb-1">No plans yet</h2>
            <p className="text-sm text-zinc-500 mb-6 max-w-xs mx-auto">
              Create your first plan and AI will generate a personalized weekly task list.
            </p>
            <Link href="/plans/new" className="btn-primary">
              Create your first plan
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} weekNumber={weekNumber} year={year} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
