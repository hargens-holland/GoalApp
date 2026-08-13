import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  completionUpdate,
  isDone,
  serializeTask,
  type TaskStatus,
} from "@/lib/tasks";

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
    status?: TaskStatus;
    notes?: string;
    metadata?: unknown;
  };

  // `status` is the underlying field; `completed` is the convenience form most
  // clients send. An explicit status wins, since it can express "skipped".
  const completionFields =
    body.status !== undefined
      ? {
          status: body.status,
          completedAt: isDone(body.status) ? new Date() : null,
        }
      : body.completed !== undefined
        ? completionUpdate(body.completed)
        : {};

  const updated = await prisma.task.update({
    where: { id: params.id },
    data: {
      ...completionFields,
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.metadata !== undefined
        ? { metadata: body.metadata as Prisma.InputJsonValue }
        : {}),
    },
  });
  return NextResponse.json(serializeTask(updated));
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
