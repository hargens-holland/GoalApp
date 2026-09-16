import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reviseRoadmap } from "@/lib/operations/revise";
import { getWeekRange } from "@/lib/dates";
import { serializeGoalTasks } from "@/lib/tasks";
import { runScheduler } from "@/lib/scheduling";
import { AdjustGoalBody, parseBody } from "@/lib/validation";
import { limitAgentCall } from "@/lib/rate-limit";

/**
 * The "editor". scope="roadmap" → Architect revises the milestones, then the
 * week is re-laid-out. scope="week" (default) → Scheduler just rebalances the
 * current week across all active goals.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await limitAgentCall(session.user.id);
  if (limited) return limited;

  const goal = await prisma.goal.findUnique({ where: { id: params.id }, select: { id: true, userId: true } });
  if (!goal || goal.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = await parseBody(request, AdjustGoalBody);
  if (!parsed.ok) return parsed.response;
  const { request: req, scope } = parsed.data;

  if (scope === "roadmap") {
    if (!req?.trim()) {
      return NextResponse.json({ error: "request is required" }, { status: 400 });
    }
    await reviseRoadmap(session.user.id, goal.id, req);
  }

  const { start, end } = getWeekRange();
  await runScheduler(session.user.id, start, end);

  const updated = await prisma.goal.findUnique({
    where: { id: goal.id },
    include: {
      milestones: { orderBy: { order: "asc" } },
      tasks: { where: { date: { gte: start, lte: end } }, orderBy: [{ date: "asc" }, { order: "asc" }] },
    },
  });
  return NextResponse.json(updated ? serializeGoalTasks(updated) : updated);
}
