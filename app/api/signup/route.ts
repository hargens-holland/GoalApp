import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { SignupBody, parseBody } from "@/lib/validation";
import { limitSignup } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = await limitSignup(request);
  if (limited) return limited;

  try {
    const parsed = await parseBody(request, SignupBody);
    if (!parsed.ok) return parsed.response;
    const { email, password, name } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, password: hashed, name: name ?? null },
      select: { id: true, email: true, name: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
