import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { normalizeIntent } from "@/lib/agents/coordinator";
import { apply, loadContext, preview } from "@/lib/coordinator";
import { limitAgentCall } from "@/lib/rate-limit";
import { AssistantApplyBody, parseBody } from "@/lib/validation";

/**
 * Step two: carry out an intent the user confirmed.
 *
 * The intent comes back from the client, so it is re-validated against a
 * freshly loaded context — ids must still belong to this user, the date must
 * still be this week — before anything runs. A stale or tampered intent
 * degrades to "unclear" and nothing happens.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseBody(request, AssistantApplyBody);
  if (!parsed.ok) return parsed.response;

  const ctx = await loadContext(session.user.id);
  const intent = normalizeIntent(parsed.data.intent, ctx);
  const proposal = preview(intent, ctx);
  if (!proposal.actionable) {
    return NextResponse.json({ error: "Nothing to apply", summary: intent.message }, { status: 409 });
  }

  // Applying may call a model; count it against the same budget as any other
  // planning request.
  if (proposal.callsModel) {
    const limited = await limitAgentCall(session.user.id);
    if (limited) return limited;
  }

  const result = await apply(intent, ctx, session.user.id);
  return NextResponse.json(result);
}
