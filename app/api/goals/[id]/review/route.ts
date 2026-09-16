import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runReview } from "@/lib/operations/review";
import { limitAgentCall } from "@/lib/rate-limit";

/**
 * PROGRESS agent endpoint. Assesses where the user is in the roadmap based on
 * recent task results, updates goal progress + milestone statuses, and records
 * a weekly ProgressSnapshot with the focus for the coming week. Cron-ready: a
 * scheduled job can POST this weekly with no logic change.
 */
export async function POST(
  _request: Request,
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

  const { data: assessment, source } = await runReview(session.user.id, goal.id);
  return NextResponse.json({ assessment, source });
}
