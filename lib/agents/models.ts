/**
 * Which model each agent uses.
 *
 * Using the largest model for everything is the default people start with
 * and the first thing production teams undo. The three agents have different
 * shapes of work:
 *
 *   Architect  — runs rarely (goal creation, explicit revision), and its
 *                output is the durable structure everything else hangs off.
 *                Quality matters most here. Opus.
 *   Progress   — runs weekly, reads a lot, writes a small assessment that is
 *                clamped and validated anyway. Sonnet.
 *   Scheduler  — runs on every change, and its output is heavily constrained
 *                by availability and by keepValidTasks. Sonnet.
 *   Coordinator — classifies a sentence into one of ten actions and fills in
 *                ids from a short context. Sonnet.
 *
 * The Sonnet assignments are a hypothesis until the eval harness (evals/)
 * shows Sonnet's roadmaps and schedules score the same as Opus's. Until then
 * they are a cost decision made explicit rather than a quality claim.
 *
 * Every assignment is overridable per agent (ARCHITECT_MODEL, …) or globally
 * (ANTHROPIC_MODEL), so an eval run or a deployment can pin whatever it wants
 * without a code change.
 *
 * Haiku 4.5 is deliberately not used: its prompt-cache minimum is 4096 tokens
 * (these prompts never reach it) and its structured-output support has not
 * been confirmed for this SDK path.
 */

export type AgentName = "architect" | "progress" | "scheduler" | "coordinator";

export const DEFAULT_MODELS: Record<AgentName, string> = {
  architect: "claude-opus-5",
  progress: "claude-sonnet-5",
  scheduler: "claude-sonnet-5",
  // Classification into a fixed set of actions with ids filled from context.
  // Measured by evals/cases/intents.json.
  coordinator: "claude-sonnet-5",
};

export function modelFor(agent: AgentName): string {
  const perAgent = process.env[`${agent.toUpperCase()}_MODEL`]?.trim();
  if (perAgent) return perAgent;
  const global = process.env.ANTHROPIC_MODEL?.trim();
  if (global) return global;
  return DEFAULT_MODELS[agent];
}
