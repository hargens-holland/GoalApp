import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await prisma.availability.findMany({
    where: { userId: session.user.id },
    orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
  });
  return NextResponse.json(rows);
}

// Replace the whole availability set with the provided weekday windows.
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { windows } = (await request.json()) as {
    windows?: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>;
  };
  const clean = (windows ?? []).filter(
    (w) =>
      w.dayOfWeek >= 0 &&
      w.dayOfWeek <= 6 &&
      w.endMinute > w.startMinute &&
      w.startMinute >= 0 &&
      w.endMinute <= 1440
  );

  await prisma.$transaction([
    prisma.availability.deleteMany({ where: { userId: session.user.id } }),
    prisma.availability.createMany({
      data: clean.map((w) => ({ ...w, userId: session.user.id })),
    }),
  ]);

  const rows = await prisma.availability.findMany({
    where: { userId: session.user.id },
    orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
  });
  return NextResponse.json(rows);
}
