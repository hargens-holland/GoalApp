import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { classifyIntent } from "@/lib/agents/coordinator";
import { loadContext, preview } from "@/lib/coordinator";
import { limitAgentCall } from "@/lib/rate-limit";
import { AssistantBody, parseBody } from "@/lib/validation";

/**
 * Step one of two: understand the sentence and say what would happen.
 * Nothing is written. The client shows the proposal and, on confirmation,
 * posts the intent back to /api/assistant/apply.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await limitAgentCall(session.user.id);
  if (limited) return limited;

  const parsed = await parseBody(request, AssistantBody);
  if (!parsed.ok) return parsed.response;

  const ctx = await loadContext(session.user.id);
  const { data: intent, source } = await classifyIntent(parsed.data.message, ctx, {
    userId: session.user.id,
    history: parsed.data.history,
  });
  const proposal = preview(intent, ctx);
  return NextResponse.json({ ...proposal, source });
}
