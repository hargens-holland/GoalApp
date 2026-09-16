/**
 * Eval runner for the Architect.
 *
 *   npx tsx evals/run.ts                                   # fallback only, no API calls
 *   npx tsx evals/run.ts --variant claude-sonnet-5 --judge # one model + judge
 *   npx tsx evals/run.ts --variant claude-opus-5 --variant claude-sonnet-5 --judge --reps 2
 *
 * Every variant runs through the app's real entry point (generateRoadmap), so
 * what is measured is what ships: same prompt, same schema, same validation.
 * The deterministic fallback always runs as a baseline; it should pass every
 * structural check (it is the oracle) and score low with the judge (it is
 * generic by design). If either stops being true, the harness is broken.
 *
 * A model variant that falls back — rate limit, timeout, invalid output — is
 * recorded in errors.jsonl with its reason, not scored as a bad roadmap. A
 * plumbing failure and a quality failure must never share a column.
 *
 * Results land in evals/results/<timestamp>/ as results.jsonl (one row per
 * case × variant × rep, with the full roadmap and grader inputs), errors.jsonl,
 * and summary.json. The console gets the summary table.
 *
 * Flags:
 *   --variant <model>   model id to evaluate; repeatable
 *   --judge             also run the LLM judge (costs money)
 *   --judge-model <id>  default claude-opus-5
 *   --reps <n>          repetitions per case × variant, default 1
 *   --limit <n>         first n cases only
 *   --tag <t>           only cases whose tags include t
 *   --concurrency <n>   parallel cases, default 4
 *   --telemetry         record calls to the app's AgentCall table (off by default)
 *   --rescore <dir>     recompute the deterministic checks over a saved run's
 *                       roadmaps with the current cases and checks — no API
 *                       calls. For when a check or a gold label changes.
 *   --suite intents     run the Coordinator intent suite instead (see
 *                       evals/intents.ts). Same --variant / --limit flags.
 */

import fs from "node:fs";
import path from "node:path";
import { generateRoadmap } from "@/lib/agents/architect";
import { fallbackRoadmap } from "@/lib/agents/architect";
import { isDemoMode } from "@/lib/agents/client";
import { estimateCost, formatUsd } from "@/lib/agents/pricing";
import type { Roadmap } from "@/lib/agents/schemas";
import { CaseFileSchema, runChecks, type CheckName, type EvalCase } from "./checks";
import { judgeRoadmap, type JudgeResult } from "./judge";
import { runIntentSuite } from "./intents";

// ---------------------------------------------------------------------------
// Args and environment
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function args(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

// Next.js loads .env for the app; scripts have to do it themselves.
try {
  process.loadEnvFile?.(".env");
} catch {
  // No .env — fine, the environment may already be set.
}
if (!flag("telemetry")) process.env.AGENT_TELEMETRY = "off";

const VARIANTS = args("variant");
const JUDGE = flag("judge");
const JUDGE_MODEL = arg("judge-model") ?? "claude-opus-5";
const REPS = Number(arg("reps") ?? 1);
const LIMIT = arg("limit") ? Number(arg("limit")) : undefined;
const TAG = arg("tag");
const CONCURRENCY = Number(arg("concurrency") ?? 4);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Row {
  variant: string;
  caseId: string;
  tags: string[];
  rep: number;
  model: string;
  source: "llm" | "fallback";
  attempts: number;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  costUsd: number;
  roadmap: Roadmap;
  checks: Partial<Record<CheckName, boolean>>;
  checkScore: number;
  failures: CheckName[];
  judge?: JudgeResult;
}

interface ErrorRow {
  variant: string;
  caseId: string;
  rep: number;
  kind: "model_fell_back" | "judge_failed" | "harness";
  detail: string;
}

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

async function mapPool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (arg("suite") === "intents") {
    if (VARIANTS.length && isDemoMode()) {
      throw new Error("Model variants requested but no API key is available (or DEMO_MODE=true).");
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    console.log(`
intent suite — variants: ${["fallback", ...VARIANTS].join(", ")}
`);
    return runIntentSuite(VARIANTS, path.join("evals", "results", stamp), LIMIT);
  }

  const file = CaseFileSchema.parse(
    JSON.parse(fs.readFileSync(path.join("evals", "cases", "roadmap.json"), "utf8"))
  );

  const rescoreDir = arg("rescore");
  if (rescoreDir) return rescore(rescoreDir, file.cases);
  let cases: EvalCase[] = file.cases;
  if (TAG) cases = cases.filter((c) => c.tags.includes(TAG));
  if (LIMIT) cases = cases.slice(0, LIMIT);

  const ids = new Set(cases.map((c) => c.id));
  if (ids.size !== cases.length) throw new Error("duplicate case ids");

  if (VARIANTS.length && isDemoMode()) {
    throw new Error(
      "Model variants requested but no API key is available (or DEMO_MODE=true). " +
        "Set ANTHROPIC_API_KEY, or run without --variant for the fallback baseline."
    );
  }

  const variants = ["fallback", ...VARIANTS];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join("evals", "results", stamp);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n${cases.length} cases × ${variants.length} variants × ${REPS} rep(s)`);
  console.log(`variants: ${variants.join(", ")}${JUDGE ? `   judge: ${JUDGE_MODEL}` : "   judge: off"}\n`);

  const rows: Row[] = [];
  const errors: ErrorRow[] = [];

  const jobs: { c: EvalCase; variant: string; rep: number }[] = [];
  for (const c of cases) for (const variant of variants) for (let rep = 0; rep < REPS; rep++) jobs.push({ c, variant, rep });

  let done = 0;
  await mapPool(jobs, CONCURRENCY, async ({ c, variant, rep }) => {
    try {
      let roadmap: Roadmap;
      let model = "fallback";
      let source: "llm" | "fallback" = "fallback";
      let attempts = 0;
      let latencyMs = 0;
      let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

      if (variant === "fallback") {
        const t = Date.now();
        roadmap = fallbackRoadmap(c.goal);
        latencyMs = Date.now() - t;
      } else {
        const outcome = await generateRoadmap(c.goal, c.clarifications, { model: variant });
        if (outcome.source !== "llm") {
          errors.push({
            variant,
            caseId: c.id,
            rep,
            kind: "model_fell_back",
            detail: `${outcome.reason} after ${outcome.attempts} attempt(s)`,
          });
          return;
        }
        roadmap = outcome.data;
        model = outcome.model;
        source = "llm";
        attempts = outcome.attempts;
        latencyMs = outcome.latencyMs;
        usage = outcome.usage;
      }

      const check = runChecks(roadmap, c);
      const row: Row = {
        variant,
        caseId: c.id,
        tags: c.tags,
        rep,
        model,
        source,
        attempts,
        latencyMs,
        usage,
        costUsd: source === "llm" ? estimateCost(model, usage) : 0,
        roadmap,
        checks: check.checks,
        checkScore: check.score,
        failures: check.failures,
      };

      if (JUDGE) {
        try {
          row.judge = await judgeRoadmap(roadmap, c, JUDGE_MODEL);
        } catch (e) {
          errors.push({ variant, caseId: c.id, rep, kind: "judge_failed", detail: e instanceof Error ? e.message : String(e) });
        }
      }
      rows.push(row);
    } catch (e) {
      errors.push({ variant, caseId: c.id, rep, kind: "harness", detail: e instanceof Error ? e.message : String(e) });
    } finally {
      done++;
      process.stdout.write(`\r  ${done}/${jobs.length}`);
    }
  });
  process.stdout.write("\n\n");

  // Persist ---------------------------------------------------------------
  fs.writeFileSync(path.join(outDir, "results.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(outDir, "errors.jsonl"), errors.map((r) => JSON.stringify(r)).join("\n") + (errors.length ? "\n" : ""));

  // Summarize -------------------------------------------------------------
  const summary = variants.map((variant) => summarize(variant, rows.filter((r) => r.variant === variant), errors.filter((e) => e.variant === variant)));
  fs.writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify({ ranAt: stamp, cases: cases.map((c) => c.id), reps: REPS, judge: JUDGE ? JUDGE_MODEL : null, variants: summary }, null, 2)
  );

  printTable(summary, cases.length * REPS);
  if (errors.length) {
    console.log(`\n${errors.length} error(s) — see ${path.join(outDir, "errors.jsonl")}`);
    for (const e of errors.slice(0, 5)) console.log(`  ${e.variant} / ${e.caseId} / rep ${e.rep}: ${e.kind} — ${e.detail}`);
  }
  console.log(`\nfull results: ${outDir}\n`);
}

// ---------------------------------------------------------------------------
// Rescore
// ---------------------------------------------------------------------------

/**
 * Re-run the deterministic checks over the roadmaps a previous run saved.
 * Judge scores are kept as recorded. Writes results back into the same
 * directory as rescored.jsonl / rescored-summary.json so the original is
 * preserved and the two can be diffed.
 */
function rescore(dir: string, cases: EvalCase[]) {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const rows: Row[] = fs
    .readFileSync(path.join(dir, "results.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Row)
    .map((r) => {
      const c = byId.get(r.caseId);
      if (!c) return r;
      const check = runChecks(r.roadmap, c);
      return { ...r, checks: check.checks, checkScore: check.score, failures: check.failures };
    });
  const errors: ErrorRow[] = fs.existsSync(path.join(dir, "errors.jsonl"))
    ? fs.readFileSync(path.join(dir, "errors.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as ErrorRow)
    : [];
  const variants = Array.from(new Set(rows.map((r) => r.variant)));
  const summary = variants.map((v) => summarize(v, rows.filter((r) => r.variant === v), errors.filter((e) => e.variant === v)));
  fs.writeFileSync(path.join(dir, "rescored.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "rescored-summary.json"), JSON.stringify({ rescoredAt: new Date().toISOString(), variants: summary }, null, 2));
  console.log(`\nrescored ${rows.length} rows from ${dir}\n`);
  printTable(summary, Math.max(...summary.map((s) => s.scored)));
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

interface VariantSummary {
  variant: string;
  scored: number;
  errors: number;
  checkScore: number;
  checkPassRate: Partial<Record<CheckName, number>>;
  judge?: { specificity: number; feasibility: number; checkability: number; sequencing: number; mean: number; sd: number };
  costUsd: { total: number; perCase: number; judgeTotal: number };
  latencyMs: { p50: number; p95: number };
  tokens: { input: number; output: number; cacheRead: number };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

function summarize(variant: string, rows: Row[], errs: ErrorRow[]): VariantSummary {
  const names = new Set<CheckName>();
  rows.forEach((r) => Object.keys(r.checks).forEach((k) => names.add(k as CheckName)));
  const checkPassRate: Partial<Record<CheckName, number>> = {};
  for (const n of Array.from(names)) {
    const applicable = rows.filter((r) => r.checks[n] !== undefined);
    checkPassRate[n] = applicable.length ? applicable.filter((r) => r.checks[n]).length / applicable.length : 0;
  }
  const judged = rows.filter((r) => r.judge);
  return {
    variant,
    scored: rows.length,
    errors: errs.length,
    checkScore: mean(rows.map((r) => r.checkScore)),
    checkPassRate,
    judge: judged.length
      ? {
          specificity: mean(judged.map((r) => r.judge!.scores.specificity)),
          feasibility: mean(judged.map((r) => r.judge!.scores.feasibility)),
          checkability: mean(judged.map((r) => r.judge!.scores.checkability)),
          sequencing: mean(judged.map((r) => r.judge!.scores.sequencing)),
          mean: mean(judged.map((r) => r.judge!.mean)),
          sd: sd(judged.map((r) => r.judge!.mean)),
        }
      : undefined,
    costUsd: {
      total: rows.reduce((s, r) => s + r.costUsd, 0),
      perCase: mean(rows.map((r) => r.costUsd)),
      judgeTotal: judged.reduce((s, r) => s + r.judge!.costUsd, 0),
    },
    latencyMs: { p50: pct(rows.map((r) => r.latencyMs), 50), p95: pct(rows.map((r) => r.latencyMs), 95) },
    tokens: {
      input: rows.reduce((s, r) => s + r.usage.inputTokens, 0),
      output: rows.reduce((s, r) => s + r.usage.outputTokens, 0),
      cacheRead: rows.reduce((s, r) => s + r.usage.cacheReadTokens, 0),
    },
  };
}

function printTable(summary: VariantSummary[], plannedPerVariant: number) {
  const col = (s: string, w: number) => s.padEnd(w);
  const num = (s: string, w: number) => s.padStart(w);
  console.log(col("variant", 18) + num("scored", 8) + num("errors", 8) + num("checks", 8) + num("judge", 8) + num("±sd", 6) + num("$/case", 9) + num("p50", 7));
  console.log("-".repeat(72));
  for (const s of summary) {
    console.log(
      col(s.variant, 18) +
        num(`${s.scored}/${plannedPerVariant}`, 8) +
        num(String(s.errors), 8) +
        num(`${Math.round(s.checkScore * 100)}%`, 8) +
        num(s.judge ? s.judge.mean.toFixed(2) : "–", 8) +
        num(s.judge ? s.judge.sd.toFixed(2) : "", 6) +
        num(s.variant === "fallback" ? "$0" : formatUsd(s.costUsd.perCase), 9) +
        num(s.variant === "fallback" ? "–" : `${(s.latencyMs.p50 / 1000).toFixed(1)}s`, 7)
    );
  }

  const withJudge = summary.filter((s) => s.judge);
  if (withJudge.length) {
    console.log("\njudge, by property (1–5):");
    console.log(col("variant", 18) + num("specific", 10) + num("feasible", 10) + num("checkable", 10) + num("sequenced", 10));
    for (const s of withJudge) {
      const j = s.judge!;
      console.log(col(s.variant, 18) + num(j.specificity.toFixed(2), 10) + num(j.feasibility.toFixed(2), 10) + num(j.checkability.toFixed(2), 10) + num(j.sequencing.toFixed(2), 10));
    }
  }

  const failing = summary.flatMap((s) =>
    Object.entries(s.checkPassRate)
      .filter(([, rate]) => rate < 1)
      .map(([name, rate]) => `  ${s.variant}: ${name} ${Math.round(rate * 100)}%`)
  );
  if (failing.length) {
    console.log("\nchecks below 100%:");
    failing.forEach((l) => console.log(l));
  }

  const n = summary[0]?.scored ?? 0;
  if (n) {
    console.log(`\nnoise floor: with n=${n}, a pass-rate difference under ~${Math.round((100 / Math.sqrt(n)) )} points is not meaningful; ` + `for the judge, compare gaps against the ±sd column.`);
  }
  const judgeCost = summary.reduce((s, v) => s + v.costUsd.judgeTotal, 0);
  const modelCost = summary.reduce((s, v) => s + v.costUsd.total, 0);
  console.log(`cost this run: ${formatUsd(modelCost)} models + ${formatUsd(judgeCost)} judge = ${formatUsd(modelCost + judgeCost)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
