import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PutAvailabilityBody, parseBody } from "@/lib/validation";

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
  const parsed = await parseBody(request, PutAvailabilityBody);
  if (!parsed.ok) return parsed.response;
  const clean = parsed.data.windows;

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
