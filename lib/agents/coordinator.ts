import { generate, type AgentOutcome } from "./client";
import { IntentSchema, type Intent } from "./schemas";
import { modelFor } from "./models";
import { UNTRUSTED_NOTICE, untrusted } from "./prompt";

/**
 * COORDINATOR AGENT
 *
 * Turns a sentence from the user — "can't do today, reschedule", "pause the
 * guitar stuff this week", "how am I doing on Spanish?" — into one of a fixed
 * set of actions, with the ids and dates it needs filled in from context.
 *
 * It never executes anything. The app shows the user what the action would
 * do, and only on confirmation does code carry it out through the same
 * functions the buttons use (lib/coordinator). That split — model classifies,
 * code acts, human approves — is deliberate: this is the first agent that
 * reads free-form instructions and causes writes, so it is the first place a
 * misread or an injected instruction could do damage.
 *
 * Orchestration by classifier-plus-dispatcher rather than by a tool-use loop
 * is the right first step. It is testable (a golden set of utterances → the
 * expected action), the set of things it can do is enumerable, and when it
 * is replaced by an agentic loop later there will be a baseline to compare
 * against.
 */

export interface CoordinatorGoal {
  id: string;
  title: string;
  status: string;
  activeMilestone: string | null;
  progress: number;
}

export interface CoordinatorTask {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  status: string;
  goalId: string;
}

/** One prior turn of the conversation, oldest first. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CoordinatorContext {
  /** YYYY-MM-DD */
  todayISO: string;
  /** YYYY-MM-DD, Monday and Sunday of the current week. */
  weekStartISO: string;
  weekEndISO: string;
  goals: CoordinatorGoal[];
  /** This week's tasks. */
  tasks: CoordinatorTask[];
}

// ---------------------------------------------------------------------------
// Deterministic fallback
// ---------------------------------------------------------------------------

const DOW = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The goal whose title shares the most words with the message, if any. */
function matchGoal(message: string, goals: CoordinatorGoal[]): CoordinatorGoal | null {
  const words = new Set(message.toLowerCase().match(/[a-z]+/g) ?? []);
  let best: CoordinatorGoal | null = null;
  let bestScore = 0;
  for (const g of goals) {
    const titleWords = (g.title.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length > 3);
    const score = titleWords.filter((w) => words.has(w)).length;
    if (score > bestScore) {
      best = g;
      bestScore = score;
    }
  }
  return best;
}

/** A date named in the message — "today", "tomorrow", a weekday — else null. */
function matchDate(message: string, ctx: CoordinatorContext): string | null {
  const m = message.toLowerCase();
  if (/\btoday\b/.test(m)) return ctx.todayISO;
  if (/\btomorrow\b/.test(m)) return addDays(ctx.todayISO, 1);
  for (let i = 0; i < 7; i++) {
    const iso = addDays(ctx.weekStartISO, i);
    const dow = DOW[new Date(`${iso}T00:00:00Z`).getUTCDay()];
    if (new RegExp(`\\b${dow}\\b`).test(m)) return iso;
  }
  return null;
}

/**
 * Keyword classification for demo mode and model failure. It handles the
 * handful of phrasings the product's own copy suggests and says "unclear" for
 * everything else, which is the honest answer from a planner with no model.
 */
export function fallbackIntent(message: string, ctx: CoordinatorContext): Intent {
  const m = message.toLowerCase();
  const goal = matchGoal(message, ctx.goals);
  const date = matchDate(message, ctx);
  const none = { date: null, goalId: null, taskId: null, request: null };

  if (/\b(replan|re-plan|redo|rebuild|reschedule)\b.*\bweek\b/.test(m) || /\bweek\b.*\b(replan|re-plan|redo|rebuild)\b/.test(m)) {
    return { ...none, action: "replan_week", message: "Rebuild the rest of this week from scratch." };
  }
  if (date && /\b(can'?t|cannot|won'?t|unable|skip|sick|busy|off|miss|no time|reschedule|move)\b/.test(m)) {
    return { ...none, action: "clear_day", date, message: `Skip what's left on ${date} and re-lay the rest of the week.` };
  }
  if (goal && /\b(pause|stop|hold|drop|skip)\b/.test(m)) {
    return { ...none, action: "pause_goal", goalId: goal.id, message: `Pause "${goal.title}" — nothing more will be scheduled for it until you resume.` };
  }
  if (goal && /\b(resume|restart|unpause|continue|back on)\b/.test(m)) {
    return { ...none, action: "resume_goal", goalId: goal.id, message: `Resume "${goal.title}" and fit it back into this week.` };
  }
  if (goal && /\b(review|assess|progress|how am i|how'?s|where am i|doing)\b/.test(m)) {
    return { ...none, action: "review_goal", goalId: goal.id, message: `Run the weekly review for "${goal.title}".` };
  }
  if (
    goal &&
    /\b(change|revise|adjust|push back|slow down|speed up|extend|shorten|more time|less time|half the time|not enough time|too (?:fast|slow|much|ambitious)|behind|ahead of|roadmap|milestone)\b/.test(m)
  ) {
    return { ...none, action: "revise_roadmap", goalId: goal.id, request: message, message: `Ask the planner to revise the roadmap for "${goal.title}": “${message}”.` };
  }
  if (/\b(replan|reschedule|redo)\b/.test(m)) {
    return { ...none, action: "replan_week", message: "Rebuild the rest of this week from scratch." };
  }
  return {
    ...none,
    action: "unclear",
    message: ctx.goals.length
      ? `I'm not sure what you'd like to change. You can say things like “can't do today”, “pause ${ctx.goals[0].title.toLowerCase()} this week”, or “review ${ctx.goals[0].title.toLowerCase()}”.`
      : "I'm not sure what you'd like to change. Add a goal first and I can plan around it.",
  };
}

// ---------------------------------------------------------------------------
// Semantic validation
// ---------------------------------------------------------------------------

/**
 * Drop ids the context does not contain, and downgrade an action that lost
 * the id it needs to "unclear". The schema guarantees shape; only this can
 * guarantee the goal or task is one of the user's own.
 */
export function normalizeIntent(intent: Intent, ctx: CoordinatorContext): Intent {
  const goalIds = new Set(ctx.goals.map((g) => g.id));
  const taskIds = new Set(ctx.tasks.map((t) => t.id));
  const out: Intent = {
    ...intent,
    goalId: intent.goalId && goalIds.has(intent.goalId) ? intent.goalId : null,
    taskId: intent.taskId && taskIds.has(intent.taskId) ? intent.taskId : null,
    date: intent.date && /^\d{4}-\d{2}-\d{2}$/.test(intent.date) ? intent.date : null,
    request: intent.request?.trim() || null,
  };

  const needsGoal = ["pause_goal", "resume_goal", "review_goal", "revise_roadmap"].includes(out.action);
  if (needsGoal && !out.goalId) {
    return { ...out, action: "unclear", message: "Which goal do you mean?" };
  }
  if (["skip_task", "complete_task"].includes(out.action) && !out.taskId) {
    return { ...out, action: "unclear", message: "Which task do you mean?" };
  }
  if (out.action === "clear_day") {
    if (!out.date) return { ...out, action: "unclear", message: "Which day can't you do?" };
    if (out.date < ctx.weekStartISO || out.date > ctx.weekEndISO) {
      return { ...out, action: "unclear", message: "I can only clear a day in the current week. Which day this week?" };
    }
  }
  if (out.action === "revise_roadmap" && !out.request) {
    return { ...out, action: "unclear", message: "What should change about the roadmap?" };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Agent call
// ---------------------------------------------------------------------------

export async function classifyIntent(
  message: string,
  ctx: CoordinatorContext,
  opts: { userId?: string; model?: string; history?: ChatTurn[] } = {}
): Promise<AgentOutcome<Intent>> {
  // The last few turns let a follow-up resolve: "how am I doing?" → "which
  // goal?" → "Spanish". Both roles are delimited as untrusted — the assistant
  // turns are ours, but they arrive back from the client, which could have
  // edited them.
  const historyText = opts.history?.length
    ? opts.history.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${untrusted(t.content).replace(/\n/g, " ")}`).join("\n")
    : "none";
  const goalsText = ctx.goals.length
    ? ctx.goals
        .map((g) => `[goalId:${g.id}] status=${g.status} progress=${g.progress}%\n${untrusted(`title: ${g.title}\ncurrent milestone: ${g.activeMilestone ?? "n/a"}`)}`)
        .join("\n")
    : "none";
  const tasksText = ctx.tasks.length
    ? ctx.tasks.map((t) => `[taskId:${t.id}] ${t.date} ${t.status} goal=${t.goalId} ${untrusted(t.title).replace(/\n/g, " ")}`).join("\n")
    : "none";

  const outcome = await generate({
    label: "coordinator.intent",
    model: opts.model ?? modelFor("coordinator"),
    userId: opts.userId,
    maxTokens: 2048,
    schema: IntentSchema,
    fallback: () => fallbackIntent(message, ctx),
    system: `You are the coordinator for a goal-planning app. The user has a few
long-term goals, each with a milestone roadmap, and a week of scheduled tasks.
They will tell you something in plain language. Your job is to decide which ONE
of the app's actions they want and fill in the ids and dates it needs, using
only the goals and tasks listed. You never carry anything out yourself; the app
will show the user your message and ask them to confirm.

Rules:
- Use the exact goalId and taskId values shown. Never invent one. If you cannot
  tell which goal or task they mean, choose "unclear" and ask.
- Resolve relative dates ("today", "Thursday") against today's date. clear_day
  must fall inside the current week; otherwise ask.
- "How am I doing" or "where am I" on a goal is review_goal. A factual question
  you can answer from the context ("what's on Thursday?") is answer.
- Anything about changing the plan itself — more time, less time, different
  milestones — is revise_roadmap, with the user's words in request.
- Use the conversation so far to resolve short follow-ups: if you asked "which
  goal?" and they answer "Spanish", that is the goal. If they say "actually,
  bring it back" after a pause, that is resume_goal for the same goal.
- One action per message. If they ask for two things, take the first and say
  in message that they can ask for the second next.
- Keep message short and concrete: name the goal or day, say what will happen.

${UNTRUSTED_NOTICE}`,
    prompt: `Today: ${ctx.todayISO} (this week runs ${ctx.weekStartISO} to ${ctx.weekEndISO})

Goals:
${goalsText}

This week's tasks:
${tasksText}

Conversation so far:
${historyText}

The user says now:
${untrusted(message)}`,
  });

  return { ...outcome, data: normalizeIntent(outcome.data, ctx) };
}
