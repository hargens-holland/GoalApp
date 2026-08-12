import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

async function ownsTask(userId: string, taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { goal: { select: { userId: true } } },
  });
  return task && task.goal.userId === userId ? task : null;
}

// Mark complete / add notes / metadata on a dated task.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await ownsTask(session.user.id, params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    completed?: boolean;
    notes?: string;
    metadata?: unknown;
  };

  const updated = await prisma.task.update({
    where: { id: params.id },
    data: {
      ...(body.completed !== undefined
        ? {
            completed: body.completed,
            status: body.completed ? "done" : "pending",
            completedAt: body.completed ? new Date() : null,
          }
        : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.metadata !== undefined
        ? { metadata: body.metadata as Prisma.InputJsonValue }
        : {}),
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
  if (!(await ownsTask(session.user.id, params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.task.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
