import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { classifyIntent, fallbackIntent, type CoordinatorContext } from "@/lib/agents/coordinator";
import { INTENT_ACTIONS, type Intent } from "@/lib/agents/schemas";
import { estimateCost, formatUsd } from "@/lib/agents/pricing";

/**
 * Intent eval for the Coordinator.
 *
 * Classification has a right answer, so this is simpler than the roadmap
 * eval: no judge, just "did it pick the action we expected, with the id or
 * date we expected". Each case is checked on the fields its `expect` names;
 * an omitted field is not checked. Adversarial cases use `actionNot` and
 * `goalIdNot` — the property is that something did *not* happen.
 *
 * Every variant runs through classifyIntent() itself, including
 * normalizeIntent, so the measured behaviour is the shipped behaviour. The
 * keyword fallback runs as the baseline.
 */

export const IntentCaseSchema = z.object({
  id: z.string(),
  $note: z.string().optional(),
  tags: z.array(z.string()).min(1),
  /** Prior turns, oldest first, for multi-turn cases. */
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).optional(),
  message: z.string(),
  expect: z.object({
    action: z.enum(INTENT_ACTIONS).optional(),
    actionNot: z.array(z.enum(INTENT_ACTIONS)).optional(),
    date: z.string().optional(),
    goalId: z.string().optional(),
    goalIdNot: z.string().optional(),
    taskId: z.string().optional(),
  }),
});
export type IntentCase = z.infer<typeof IntentCaseSchema>;

export const IntentFileSchema = z.object({
  $comment: z.string().optional(),
  context: z.object({
    todayISO: z.string(),
    weekStartISO: z.string(),
    weekEndISO: z.string(),
    goals: z.array(z.object({ id: z.string(), title: z.string(), status: z.string(), activeMilestone: z.string().nullable(), progress: z.number() })),
    tasks: z.array(z.object({ id: z.string(), title: z.string(), date: z.string(), status: z.string(), goalId: z.string() })),
  }),
  cases: z.array(IntentCaseSchema).min(1),
});

export function loadIntentFile() {
  return IntentFileSchema.parse(JSON.parse(fs.readFileSync(path.join("evals", "cases", "intents.json"), "utf8")));
}

/** Which expected fields matched. Pure. */
export function gradeIntent(intent: Intent, c: IntentCase): { pass: boolean; mismatches: string[] } {
  const m: string[] = [];
  const e = c.expect;
  if (e.action !== undefined && intent.action !== e.action) m.push(`action ${intent.action} ≠ ${e.action}`);
  if (e.actionNot && e.actionNot.includes(intent.action)) m.push(`action ${intent.action} is forbidden`);
  if (e.date !== undefined && intent.date !== e.date) m.push(`date ${intent.date} ≠ ${e.date}`);
  if (e.goalId !== undefined && intent.goalId !== e.goalId) m.push(`goalId ${intent.goalId} ≠ ${e.goalId}`);
  if (e.goalIdNot !== undefined && intent.goalId === e.goalIdNot) m.push(`goalId ${intent.goalId} is forbidden`);
  if (e.taskId !== undefined && intent.taskId !== e.taskId) m.push(`taskId ${intent.taskId} ≠ ${e.taskId}`);
  return { pass: m.length === 0, mismatches: m };
}

export interface IntentRow {
  variant: string;
  caseId: string;
  tags: string[];
  intent: Intent;
  pass: boolean;
  mismatches: string[];
  latencyMs: number;
  costUsd: number;
}

export async function runIntentSuite(variants: string[], outDir: string, limit?: number) {
  const file = loadIntentFile();
  const ctx: CoordinatorContext = file.context;
  const cases = limit ? file.cases.slice(0, limit) : file.cases;
  const all = ["fallback", ...variants];
  const rows: IntentRow[] = [];
  const errors: { variant: string; caseId: string; detail: string }[] = [];

  for (const variant of all) {
    for (const c of cases) {
      try {
        if (variant === "fallback") {
          const t = Date.now();
          const intent = fallbackIntent(c.message, ctx);
          const g = gradeIntent(intent, c);
          rows.push({ variant, caseId: c.id, tags: c.tags, intent, ...g, latencyMs: Date.now() - t, costUsd: 0 });
          continue;
        }
        const outcome = await classifyIntent(c.message, ctx, { model: variant, history: c.history });
        if (outcome.source !== "llm") {
          errors.push({ variant, caseId: c.id, detail: `${outcome.reason} after ${outcome.attempts} attempt(s)` });
          continue;
        }
        const g = gradeIntent(outcome.data, c);
        rows.push({
          variant,
          caseId: c.id,
          tags: c.tags,
          intent: outcome.data,
          ...g,
          latencyMs: outcome.latencyMs,
          costUsd: estimateCost(outcome.model, outcome.usage),
        });
      } catch (e) {
        errors.push({ variant, caseId: c.id, detail: e instanceof Error ? e.message : String(e) });
      }
      process.stdout.write(`\r  ${rows.length + errors.length}/${all.length * cases.length}`);
    }
  }
  process.stdout.write("\n\n");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "intents.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  if (errors.length) fs.writeFileSync(path.join(outDir, "intents-errors.jsonl"), errors.map((r) => JSON.stringify(r)).join("\n") + "\n");

  const col = (s: string, w: number) => s.padEnd(w);
  const num = (s: string, w: number) => s.padStart(w);
  console.log(col("variant", 18) + num("accuracy", 10) + num("n", 5) + num("$/case", 9) + num("p50", 7));
  console.log("-".repeat(49));
  for (const v of all) {
    const vs = rows.filter((r) => r.variant === v);
    const acc = vs.length ? vs.filter((r) => r.pass).length / vs.length : 0;
    const lat = vs.map((r) => r.latencyMs).sort((a, b) => a - b);
    const p50 = lat.length ? lat[Math.floor(lat.length / 2)] : 0;
    const cost = vs.length ? vs.reduce((s, r) => s + r.costUsd, 0) / vs.length : 0;
    console.log(col(v, 18) + num(`${Math.round(acc * 100)}%`, 10) + num(String(vs.length), 5) + num(v === "fallback" ? "$0" : formatUsd(cost), 9) + num(v === "fallback" ? "–" : `${(p50 / 1000).toFixed(1)}s`, 7));
  }

  const failed = rows.filter((r) => !r.pass);
  if (failed.length) {
    console.log("\nmisses:");
    for (const r of failed) console.log(`  ${r.variant} / ${r.caseId}: ${r.mismatches.join("; ")}`);
  }
  if (errors.length) {
    console.log(`\n${errors.length} error(s):`);
    for (const e of errors.slice(0, 5)) console.log(`  ${e.variant} / ${e.caseId}: ${e.detail}`);
  }
  console.log(`\nnoise floor: n=${cases.length}, one case is ${Math.round(100 / cases.length)} points.`);
  console.log(`cost this run: ${formatUsd(rows.reduce((s, r) => s + r.costUsd, 0))}`);
  console.log(`\nfull results: ${outDir}\n`);
}
