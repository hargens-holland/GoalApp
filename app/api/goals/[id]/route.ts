import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PatchGoalBody, parseBody } from "@/lib/validation";
import { getWeekRange } from "@/lib/dates";
import { serializeGoalTasks } from "@/lib/tasks";

async function ownedGoal(userId: string, id: string) {
  const goal = await prisma.goal.findUnique({ where: { id } });
  return goal && goal.userId === userId ? goal : null;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { start, end } = getWeekRange();
  const goal = await prisma.goal.findUnique({
    where: { id: params.id },
    include: {
      milestones: { orderBy: { order: "asc" } },
      tasks: { where: { date: { gte: start, lte: end } }, orderBy: [{ date: "asc" }, { order: "asc" }] },
      snapshots: { orderBy: [{ year: "desc" }, { weekNumber: "desc" }], take: 8 },
    },
  });
  if (!goal || goal.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(serializeGoalTasks(goal));
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await ownedGoal(session.user.id, params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = await parseBody(request, PatchGoalBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const updated = await prisma.goal.update({
    where: { id: params.id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.goal !== undefined ? { goal: body.goal } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await ownedGoal(session.user.id, params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.goal.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
