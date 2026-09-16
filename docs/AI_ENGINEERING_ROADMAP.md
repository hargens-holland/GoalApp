# AI Engineering Roadmap

This is the plan for growing Goal Planner from "three agents with structured
outputs" into a project that exercises the full AI-engineering toolkit: tool
use, MCP, RAG, caching, evals, observability, agent hosting, and guardrails.

Each section answers the same four questions: what the concept is, where it
plugs into *this* codebase, the smallest concrete feature that would exercise
it, and what you can honestly claim once it ships. Sections are roughly
ordered by how much they build on each other; the "Suggested order" at the end
is the short version.

The one rule for every addition: **it must go through
[`lib/agents/client.ts`](../lib/agents/client.ts)**. That file is the single
chokepoint for every model call — schema enforcement, retries, fallbacks,
logging. New capabilities extend it; they do not route around it.

### Status — 2026-09-16

| Section | State |
|---|---|
| Phase 0 hardening | **Done** except the per-visitor demo account. Validation, rate limits, prompt delimiting, headers, cost logging all shipped. |
| §1 Model routing | **Done and measured** for the Architect (Opus vs Sonnet, `evals/README.md`). Sonnet elsewhere is a hypothesis. |
| §2 Prompt caching | **Plumbed.** System/user split with `cache_control`; inert until the stable prefix exceeds the per-model minimum. |
| §7 Evals | **Done for the Architect.** 24 cases, 9 deterministic checks, 4-property judge, `--rescore`, weekly workflow. Scheduler and Progress still need harnesses. |
| §8 Observability | **Done.** `AgentCall` table, `/admin/usage`. Swap for Langfuse/Braintrust when volume warrants. |
| §10 Guardrails / HITL | **Partly done.** Propose-then-confirm on every Coordinator action; ids validated against the user's own data twice. Write tools with staging (§4) still ahead. |
| §11 Orchestration | **First version done** as classifier + dispatcher (the Coordinator), graded 25/25. The tool-use-loop version, and the comparison against this baseline, is the next step. |
| §3–§6, §9 | Not started. Recommended next: §5a MCP calendar (needs Google OAuth credentials), then §9 cron for the weekly review. |

---

## Phase 0 — Pre-deploy hardening

Not AI engineering, but it gates the public demo, so it comes first. Findings
from a review of the current code:

| Issue | Where | Fix |
|---|---|---|
| No rate limiting on any route. Once a real `ANTHROPIC_API_KEY` is set, `/api/goals` and `/api/goals/clarify` are unauthenticated-signup-away from spending your credits. | `app/api/**` | Add per-IP + per-user limits with `@upstash/ratelimit` (Vercel-friendly) on signup and every route that calls an agent. |
| No input length caps. Goal text, clarifications, and task notes flow straight into prompts. | `app/api/goals/route.ts`, `app/api/goals/clarify/route.ts`, `app/api/tasks/[id]/route.ts` | Validate every request body with zod: `goal` ≤ 500 chars, ≤ 5 clarifications of ≤ 500 chars each, notes ≤ 2,000 chars. Reject with 400. |
| Weak signup validation: 6-char minimum, no email format check, body parsed as loose `as {...}`. | `app/api/signup/route.ts` | zod schema: `z.email()`, password ≥ 10 chars. Consider a breached-password check later. |
| Shared demo account with a public password. Anyone can trash the demo data for everyone else. | `prisma/seed.ts`, `components/AuthCard.tsx` | Either (a) a nightly Vercel Cron that re-runs the seed, or (b) create a throwaway user per "Explore the demo" click and purge users older than 24 h. (b) is the better demo. |
| No security headers. | `next.config.mjs` | Add `headers()` with CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. |
| User text is interpolated into prompts as trusted. Harmless today (structured outputs mean the model can only return a roadmap) but becomes a real prompt-injection surface the moment agents get tools. | `lib/agents/*.ts` | Wrap user-supplied text in a clearly delimited block and tell the model it is data, not instructions. See "Guardrails" below. |
| Cost visibility is zero. | `lib/agents/client.ts` | Log `usage.input_tokens` / `output_tokens` per call now; it's two lines and everything in "Observability" builds on it. |

What's already right and worth keeping: every mutating route checks
ownership before touching a row; passwords are bcrypt-hashed; secrets are
gitignored; `DEMO_MODE` makes the public deploy incapable of spending money;
CI forces demo mode so a stray key can't bill you from GitHub Actions.

---

## 1. Model routing

**Concept.** Different tasks deserve different models. Using the largest model
for everything is the default beginners choose and the first thing production
teams undo.

**Where it plugs in.** `MODEL` in `client.ts` is a single constant. Make it a
parameter of `generate()` and let each agent choose.

**First feature.** Architect stays on Opus (runs rarely, quality matters most).
Progress moves to Sonnet (weekly, reads a lot, writes a small assessment).
Scheduler moves to Sonnet or Haiku (runs on every change, output is constrained
by availability anyway). Also bump from `claude-opus-4-8` to the Claude 5
family.

**You can claim.** Per-task model selection with a measured cost/quality
trade-off — *measured* being the point, which is why Evals (§7) should land
around the same time.

---

## 2. Prompt caching

**Concept.** The API can cache a stable prefix of a prompt so repeated calls
only pay for the part that changed. Big win when the same large context is
sent over and over.

**Where it plugs in.** The Scheduler prompt is exactly that shape: system
instructions + every active goal's roadmap + the user's availability (stable)
followed by "this week's focus" (changes). Same for Progress: the roadmap is
stable, the last 14 days of completions change.

**First feature.** Split each agent's prompt into a `system` block (cached) and
a `user` block (dynamic). Add `cache_control` to the system block. Log
`cache_read_input_tokens` alongside the existing token usage and watch the
Scheduler's per-call cost drop on the second run.

**You can claim.** Prompt caching with before/after cost numbers from your own
logs.

---

## 3. Streaming

**Concept.** Return tokens as they're generated instead of after the full
response. For a 20-second roadmap generation, the difference between "spinner"
and "watching the plan appear" is the whole UX.

**Where it plugs in.** `client.ts` uses `messages.parse()`, which waits for the
complete response. The SDK's streaming helpers can emit partial structured
output.

**First feature.** Stream milestones onto the new-goal page one at a time as
the Architect produces them. Keep the non-streaming path for the Scheduler
(its output is only useful once complete).

**You can claim.** Streaming structured output to a React UI, and knowing when
*not* to stream.

---

## 4. Tool use

**Concept.** Instead of the model returning a plan you then act on, the model
calls functions you've defined — reads data, asks for more context, takes
actions — in a loop until it's done.

**Where it plugs in.** The agents currently get everything they need
pre-loaded into the prompt. That works because the data is small. Tools let
the agent *decide* what it needs.

**First feature.** Give the Progress agent two read-only tools:
`get_task_history(goalId, days)` and `get_milestone_notes(milestoneId)`. Let it
pull three weeks of history when two weeks looks ambiguous, instead of you
guessing the right window in code. Implement with `client.beta.messages.toolRunner`
so the loop is handled for you; keep the final answer schema-constrained so
the existing fallback logic still works.

Then a write tool, with a guardrail: the Scheduler gets
`propose_task_move(taskId, newDate)` — but proposals are staged, not applied,
until the user confirms (see §10).

**You can claim.** Agentic tool-use loops with read/write separation and a
human approval step on writes.

---

## 5. MCP

**Concept.** Model Context Protocol is the standard for plugging tools and data
sources into models. Two directions: your app can *consume* MCP servers
(client), and your app can *be* an MCP server that other agents call.

### 5a. As a client — real calendar data

The availability form (`app/(app)/settings/availability`) is a manual stand-in
for the user's actual calendar. Replace it: connect the Scheduler to a Google
Calendar MCP server so it reads real busy blocks and places tasks into genuine
gaps. This is the single feature that makes the product real.

Start with the MCP connector in the Messages API (the model talks to the MCP
server directly; you pass the server URL). Later, move the MCP client into
your own code so you control which tools the model sees.

### 5b. As a server — Goal Planner inside Claude

Expose `list_goals`, `get_this_week`, `complete_task`, and `add_note` as an MCP
server. Then a user can say "mark my Tuesday task done and note that the
tutorial was harder than expected" from Claude Desktop, Claude Code, or any
MCP client, and it hits your database. Auth via a per-user API token stored
in the `User` table.

**You can claim.** Built both sides of MCP; know the difference between the
model calling MCP directly and mediating it yourself.

---

## 6. RAG and memory

**Concept.** Retrieval-Augmented Generation: store text as embeddings, retrieve
the relevant pieces at query time, put them in the prompt. "Memory" is RAG over
the user's own history.

**Where it plugs in.** Progress currently sees the last 14 days. Everything
older is gone. But the notes a user writes on tasks ("this was too easy",
"couldn't find time on weekdays") are exactly what a good coach would
remember months later.

**First feature.** Add `pgvector` to Postgres (Neon supports it). Embed every
task note and every `ProgressSnapshot` on write. When Progress runs, retrieve
the 5 most similar past notes/snapshots across *all* the user's goals and
include them as "things you've learned about this user". Use the Voyage
embedding models (Anthropic's recommended embeddings) or OpenAI's; the choice
matters less than having a swap-able `embed()` function.

Second: semantic search over goals in the UI ("what did I say about
mornings?") — trivial once embeddings exist.

**You can claim.** RAG with pgvector, chunking decisions (a note is a chunk; a
snapshot is a chunk), and retrieval feeding an agent rather than a chatbot.

---

## 7. Evals

**Concept.** Systematic measurement of model output quality, so a prompt or
model change is a decision backed by numbers instead of vibes. This is the
skill that most separates "uses LLMs" from "AI engineer".

**Where it plugs in.** You have an unusual asset: every agent has a
deterministic fallback that produces a valid, coherent output. That's a
baseline. And the schemas already define "structurally valid".

**First feature.** `evals/` directory with:

1. **A golden set** — 20–30 goals with hand-written "good roadmap" criteria
   (milestone count in range, success criteria are checkable, weeks add up to
   the stated timeframe, no milestone is just a restatement of the goal).
2. **Deterministic checks** — code that scores an output against those
   criteria. Run against both the model and the fallback.
3. **LLM-as-judge** — a separate call (different model, ideally) that grades
   roadmap quality on a rubric. Calibrate it against 10 human-graded examples
   first so you know whether to trust it.
4. **A CI job** that runs the deterministic checks on every PR (cheap) and the
   judge nightly (costs money).

Then use it: try Sonnet vs Opus for the Architect (§1), try with and without
retrieved memory (§6), and let the eval decide.

**You can claim.** Built an eval harness, calibrated an LLM judge, made model
and prompt decisions from data.

---

## 8. Observability

**Concept.** Knowing what every model call cost, how long it took, what it
returned, and why it fell back — in aggregate, over time, not by grepping logs.

**Where it plugs in.** `logOutcome()` in `client.ts` already emits one line per
call with `source` and `reason`. Extend it.

**First feature.** Add an `AgentCall` table: `label`, `model`, `inputTokens`,
`outputTokens`, `cacheReadTokens`, `latencyMs`, `source`, `reason`,
`userId`, `createdAt`. Write one row per `generate()`. Then a `/admin/usage`
page with cost per agent per day and fallback rate. When you're ready for a
real tool, swap the table for Langfuse or Braintrust — the data shape is the
same.

**You can claim.** Token/cost/latency tracing per agent with a fallback-rate
SLO you actually watch.

---

## 9. Agent hosting and scheduling

**Concept.** Agents that run on their own schedule or for longer than an HTTP
request allows, and where they run. Serverless functions time out; some agent
work doesn't fit.

**Where it plugs in.** Progress is documented as "runs weekly" but nothing
actually triggers it — the user has to hit the review button. The Scheduler
is documented as "runs on any change" but goal creation deliberately skips it
to stay under the serverless time limit.

**First feature.** Vercel Cron hitting a `/api/cron/weekly-review` route every
Sunday night that runs Progress for every active goal, then the Scheduler for
every user. Protect it with a `CRON_SECRET` header.

Second: when a job outgrows a single function invocation (Progress across
hundreds of users), move it to a durable-execution runtime — Inngest or
Trigger.dev — where each step is retried independently and the whole run
survives a cold start.

Third, when you want to learn the managed path: rebuild the weekly review as a
Claude Managed Agent (server-hosted, sandboxed, with its own tool access) and
compare the operational burden against running it yourself.

**You can claim.** Cron-driven agents, durable execution, and a
self-hosted-vs-managed comparison you've actually done.

---

## 10. Guardrails and human-in-the-loop

**Concept.** Preventing the model from doing damage: prompt injection defence,
output constraints, approval gates on consequential actions.

**Where it plugs in.** Already present in embryo — the clarifying-questions
step is human-in-the-loop, and "Progress may not write tasks" is an
architectural guardrail. The moment §4 and §5 give agents write access to
calendars, this becomes load-bearing.

**First feature.**
- Every user-supplied string enters prompts inside a delimited block with an
  explicit "this is data" instruction (Phase 0).
- Any write tool stages a `ProposedChange` row instead of mutating. The UI
  shows "The scheduler wants to move 3 tasks — accept / reject / edit".
- A classifier call (Haiku, cheap) on goal text at creation that flags
  content the app shouldn't plan (self-harm, illegal activity) and routes to
  a gentle refusal rather than a roadmap.

**You can claim.** Layered guardrails: input handling, capability separation,
approval gates, and a lightweight safety classifier.

---

## 11. Multi-agent orchestration

**Concept.** A coordinating agent that decides which specialist agents to run
and in what order, rather than routes hard-coding the sequence.

**Where it plugs in.** Today `app/api/**` decides when Architect, Progress, and
Scheduler run. That's correct for now — deterministic orchestration is easier
to test and debug than a coordinator. Do this *last*, when the number of
agents and triggers has grown enough that hard-coding hurts.

**First feature.** A "re-plan" endpoint where the user writes free text ("I
got sick this week and I want to push everything back") and a coordinator
decides: adjust roadmap? re-assess progress? just reschedule? — then calls the
right agents with the right inputs and explains what it did. Build it on the
Claude Agent SDK so you learn the framework, and compare to the hand-rolled
version.

**You can claim.** Knowing when orchestration by code beats orchestration by
model, and having built both.

---

## Suggested order

```
Phase 0  Hardening ─────────────────────────────────────┐
                                                        ▼
  §8 Observability (token logging)  →  §1 Model routing  →  §2 Prompt caching
                                                        │
                                                        ▼
                                              §7 Evals (golden set + checks)
                                                        │
                    ┌───────────────────────────────────┼─────────────────┐
                    ▼                                   ▼                 ▼
             §3 Streaming                        §6 RAG / memory    §9 Cron + hosting
                                                        │
                                                        ▼
                                          §4 Tool use  →  §10 Guardrails
                                                        │
                                                        ▼
                                                    §5 MCP (client, then server)
                                                        │
                                                        ▼
                                                §11 Orchestration (last)
```

Observability first because every later section wants numbers. Evals early
because every later section changes model behaviour and you want to know
whether it got better. Orchestration last because it's the one you'll be
tempted to do first and it's the one that pays off least until the rest
exists.

---

## Keeping the story straight

Each shipped section should update three places so the project stays legible
to someone reading it cold:

1. **`docs/ARCHITECTURE.md`** — the design and the *why*.
2. **`README.md`** — one bullet under "LLM integration" and, if it changed the
   product, a screenshot.
3. **Tests** — a contract test for any new schema, an eval for any new prompt.

The goal is that a reader can open this repo and see not just that you used
these techniques, but that you chose them for reasons and measured the result.
