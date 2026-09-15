import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateClarifyingQuestions } from "@/lib/agents/architect";
import { ClarifyBody, parseBody } from "@/lib/validation";
import { limitAgentCall } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await limitAgentCall(session.user.id);
  if (limited) return limited;

  const parsed = await parseBody(request, ClarifyBody);
  if (!parsed.ok) return parsed.response;
  const { goal } = parsed.data;

  const { data: questions, source } = await generateClarifyingQuestions(goal, { userId: session.user.id });
  return NextResponse.json({ questions, source });
}
