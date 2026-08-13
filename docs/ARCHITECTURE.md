# Architecture

Goal Planner turns a stated goal into a roadmap, works out where you are in that
roadmap each week, and lays the current focus of every active goal onto a real
calendar inside the hours you're actually free.

This document covers how the pieces fit together, the decisions behind them, and
what happens when the LLM misbehaves.

---

## System overview

```mermaid
flowchart TB
    subgraph client["Browser"]
        UI["React Server Components<br/>+ client components for interaction"]
    end

    subgraph server["Next.js server (App Router)"]
        MW["middleware.ts<br/>route protection"]
        Pages["Server components<br/>read via Prisma directly"]
        API["Route handlers<br/>/api/goals · /api/schedule · /api/tasks"]

        subgraph domain["Domain layer (lib/)"]
            direction TB
            Agents["agents/<br/>architect · progress · scheduler"]
            Client["agents/client.ts<br/>schema enforcement · retry · fallback"]
            Sched["scheduling/<br/>availability · placement · run-scheduler"]
            Dates["dates.ts<br/>UTC week math"]
        end
    end

    DB[("PostgreSQL<br/>via Prisma")]
    LLM["Anthropic API<br/>Claude Opus 4.8"]

    UI -->|"fetch"| API
    UI -.->|"SSR"| Pages
    MW --> Pages
    MW --> API
    Pages --> DB
    API --> DB
    API --> Agents
    API --> Sched
    Agents --> Client
    Sched --> Agents
    Sched --> DB
    Client -->|"structured output<br/>(JSON schema enforced)"| LLM
    Client -.->|"on any failure"| Fallback["Deterministic planner"]

    style LLM fill:#4a3a7a,color:#fff
    style Fallback fill:#3a5a4a,color:#fff
    style DB fill:#2a4a6a,color:#fff
```

**Layers, top to bottom:**

| Layer | Where | Responsibility |
|---|---|---|
| Presentation | `app/(app)/**`, `components/**` | Server components read the database directly; client components handle interaction and optimistic updates. |
| HTTP | `app/api/**` | Auth, ownership checks, request validation, persistence. Thin — no planning logic. |
| Domain | `lib/agents`, `lib/scheduling` | All planning logic. Pure and independently testable wherever possible. |
| Data | `prisma/` | Schema and migrations. |

---

## The three agents

The central design decision is that planning is **three separate agents with
one job each**, rather than a single "plan my goal" prompt.

```mermaid
flowchart LR
    Goal["Goal<br/><i>user states it once</i>"]

    Goal --> A["🏗 ARCHITECT<br/>runs rarely"]
    A --> M["Milestones<br/><i>the durable roadmap</i>"]

    M --> P["📊 PROGRESS<br/>runs weekly"]
    Done["Completed tasks<br/>+ user notes"] --> P
    P --> S["Snapshot<br/><i>where you are · this week's focus</i>"]

    S --> SC["🗓 SCHEDULER<br/>runs on any change"]
    Avail["Availability<br/><i>free time per weekday</i>"] --> SC
    SC --> T["Dated tasks<br/><i>the calendar</i>"]

    T -.->|"completions feed back"| Done

    style A fill:#4a3a7a,color:#fff
    style P fill:#4a3a7a,color:#fff
    style SC fill:#4a3a7a,color:#fff
```

| Agent | File | Runs | Reads | Writes |
|---|---|---|---|---|
| **Architect** | `lib/agents/architect.ts` | Goal creation, explicit re-plan | Goal + clarifying answers | `Milestone[]` |
| **Progress** | `lib/agents/progress.ts` | Weekly review | Roadmap + last 14 days of completions and notes | `ProgressSnapshot`, milestone statuses, `Goal.progress` |
| **Scheduler** | `lib/agents/scheduler.ts` | Goal creation, adjustment, week regeneration | All active goals' current focus + availability | `Task[]` |

### Why split them

**Different cadences.** A roadmap should be stable — regenerating it weekly
would mean the goal keeps changing shape underneath the user. The daily
calendar, by contrast, should be rewritten freely. Separate agents let each run
on its natural schedule instead of forcing one rate on both.

**Evaluation must not write tasks.** If a single agent both judged progress and
wrote the schedule, a bad judgement would silently rewrite the user's week with
no visible cause. Progress returns an assessment and nothing else; only the
Scheduler writes tasks. A wrong assessment produces a visibly wrong *focus*,
which the user can correct, instead of a silently wrong *week*.

**Smaller prompts, checkable outputs.** Each agent has one output schema, so
each can be validated and tested in isolation. A single mega-prompt producing
roadmap + assessment + calendar in one object would fail as a unit.

**Cross-goal scheduling needs one scheduler.** Balancing four goals against a
finite week is inherently global. The Scheduler takes every active goal at once,
which is why it can avoid stacking three goals onto the same Tuesday evening —
something per-goal planning structurally cannot do.

### The model decides *what*, code decides *when*

The Scheduler agent picks which **day** a task belongs on — a judgement call
about pacing and sequencing. It does not pick the time of day. That is
`lib/scheduling/placement.ts`: a deterministic packer that walks each day's free
blocks and assigns concrete start/end times.

This split exists because "does a 45-minute task fit between 09:00 and 09:30" is
exact arithmetic, and an LLM is both slower and less reliable at it than a
`while` loop. Tasks that don't fit are returned unplaced rather than dropped or
overlapped, so an overbooked day is visible instead of silently truncated.

---

## Adaptive regeneration

Regeneration is what makes the plan adapt rather than decay. All three entry
points — creating a goal, requesting an adjustment, refreshing the week — funnel
through `runScheduler()` in `lib/scheduling/run-scheduler.ts`.

```mermaid
sequenceDiagram
    participant U as User
    participant API as Route handler
    participant RS as runScheduler
    participant DB as PostgreSQL
    participant LLM as Claude

    U->>API: "make this week lighter"
    API->>RS: runScheduler(userId, weekStart, weekEnd)
    RS->>DB: load active goals + latest snapshots
    RS->>DB: load availability for the range
    RS->>DB: load existing tasks (avoid duplicates)
    RS->>LLM: current focus + capacity per day
    LLM-->>RS: proposed tasks (schema-enforced)
    RS->>RS: semantic validation (keepValidTasks)
    RS->>RS: time-slot placement (deterministic)
    RS->>DB: TRANSACTION: delete incomplete + insert new
    RS-->>API: { created, source }
```

Two properties make this safe to run repeatedly:

**Completed work is never destroyed.** The delete is scoped to
`completed: false`. Regenerating a week you're halfway through rewrites only what
you haven't done. This is why the whole week can be rebuilt rather than diffed —
the destructive part is bounded to work that has no user investment in it.

**The rewrite is atomic.** Delete and insert run in one `prisma.$transaction`.
An earlier version issued the delete, then inserted rows one at a time in a
loop; a failure partway through left the user with a half-written week *after*
their previous one was already gone. Either the whole new layout lands or the
old one is untouched.

Regeneration is therefore idempotent within its range: running it twice with the
same inputs produces the same result, and running it against a partially
completed week preserves the completed part.

---

## LLM integration

All model access goes through one function: `generate()` in
`lib/agents/client.ts`. Nothing else in the codebase imports the Anthropic SDK.

### Structured outputs, not prompt-and-hope

Each agent declares its output as a Zod schema (`lib/agents/schemas.ts`). That
schema is compiled to JSON Schema and passed as `output_config.format`, which
*constrains* generation rather than requesting a format in prose.

This removed an entire failure class. The previous implementation asked for
"raw JSON only, no markdown" and then stripped code fences with a regex before
`JSON.parse` — a parser that fails on any prose preamble, any trailing
explanation, or any nested fence. Because the schema is enforced at generation
time, the prompts no longer contain formatting instructions at all and are
shorter and more focused on the actual task.

### Two layers of validation

Schema conformance is not correctness. The schema proves a task has a
`goalId: string`; it cannot prove that goal exists or belongs to this user.

1. **Structural** — enforced by the API, verified again client-side by Zod when
   parsing. Guarantees shape and types.
2. **Semantic** — `keepValidTasks()` and `normalizeAssessment()`. Discards tasks
   referencing unknown goals or out-of-range dates, rewrites cross-goal milestone
   references, clamps percentages, and strips hallucinated milestone ids.

Without the second layer, a structurally perfect response could still violate a
foreign key, write a task into a week the user wasn't viewing, or set a goal's
progress to 150%.

### Failure handling

`generate()` **never throws**. Planning enhances an app that must keep working,
so every failure resolves to a deterministic fallback and a typed reason:

| Condition | `reason` | Behaviour |
|---|---|---|
| No API key, or `DEMO_MODE=true` | `demo_mode` | Deterministic planner. The normal state of the public demo. |
| 429 after SDK retries | `rate_limited` | Fallback; logged as a warning. |
| 5xx / 529 after SDK retries | `service_unavailable` | Fallback. |
| Exceeded 90s timeout | `timeout` | Fallback. |
| Network failure | `connection_error` | Fallback. |
| Invalid/revoked key | `auth_error` | Fallback; indicates misconfiguration. |
| Output failed schema, or hit `max_tokens` mid-object | `invalid_output` | **One retry**, then fallback. |
| Model declined on safety grounds | `refused` | Fallback immediately — a retry of an identical prompt won't differ. |

**Retry policy is split deliberately.** Transport failures (429/5xx/network) are
retried by the SDK, which already implements exponential backoff with jitter and
honours `retry-after`; reimplementing that badly would be worse than not
reimplementing it. It's configured explicitly (`maxRetries: 2`) so the policy is
stated in the code rather than inherited invisibly. Semantic failures — output
the SDK considers a success but the schema rejects — can only be handled at the
application layer, and get one retry. Twice-unusable output from a constrained
model is unlikely to improve on a third attempt, and the user is better served
by an immediate fallback than a third round of latency.

Every call logs `source`, `reason`, and `attempts`. Without that there is no way
to tell from the outside whether a plan was model-generated or fabricated by the
fallback — the two produce identical-looking rows.

### Demo mode

`DEMO_MODE=true` forces the deterministic path even when a key is present. This
is what makes a public demo safe: a shared, unauthenticated deployment can never
spend real credits or be used as a free proxy to the Anthropic API.

Demo mode is not a degraded state. Every agent has a real planner behind it —
the Architect's four-phase roadmap, the Progress agent's completion-ratio
estimate, the Scheduler's capacity-aware round-robin — so the entire product is
exercisable end to end with no key and no network. The fallbacks are held to the
same schemas as model output and are tested against them, so the demo path
cannot drift out of contract.

---

## Data model

```mermaid
erDiagram
    User ||--o{ Goal : owns
    User ||--o{ Availability : configures
    Goal ||--o{ Milestone : "roadmap of"
    Goal ||--o{ Task : "scheduled work"
    Goal ||--o{ ProgressSnapshot : "weekly history"
    Milestone ||--o{ Task : "contributes to"

    User { string id PK
           string email UK
           string password }
    Goal { string id PK
           string goal
           string status
           int progress
           json clarifications }
    Milestone { string id PK
                int order
                string status
                string successCriteria
                int targetWeekOffset }
    Task { string id PK
           datetime date
           datetime scheduledStart
           datetime scheduledEnd
           string status
           datetime completedAt
           string notes }
    ProgressSnapshot { string id PK
                       int weekNumber
                       int year
                       string focusForWeek
                       string currentMilestoneId }
    Availability { string id PK
                   int dayOfWeek
                   int startMinute
                   int endMinute }
```

### Why it's shaped this way

**Milestones and Tasks are separate tables, not one "task" table with a
`type`.** They have genuinely different lifecycles: a milestone is durable
structure written once and rarely revised; a task is disposable and rewritten
every regeneration. Sharing a table would mean the regeneration delete had to
carefully avoid half its own rows.

**`Task.milestoneId` is `onDelete: SetNull`, while everything else cascades.**
When the Architect revises a roadmap, the old milestones are deleted — but the
tasks already scheduled against them still represent real work the user may have
completed. Nulling the reference preserves that history. Everything hanging off
`Goal` and `User` cascades, because deleting a goal genuinely should remove its
tasks.

**`ProgressSnapshot` is append-only history keyed
`@@unique([goalId, weekNumber, year])`.** One assessment per goal per ISO week,
upserted so a re-run corrects the week rather than duplicating it. Keeping
history rather than overwriting a single "current status" field is what makes
the weekly progress chart and the streak calculation possible. The key uses the
*ISO week-year*, which is not always the calendar year — 2027-01-01 falls in
week 53 of 2026 — so `lib/dates.ts` computes it properly rather than reading
`getFullYear()`. Getting this wrong would collide two different weeks onto one
row at year boundaries.

**`Availability` stores minutes-from-midnight integers, not times.** A recurring
weekly window is a wall-clock concept with no date attached; storing `540` and
`1020` for "09:00–17:00 Monday" avoids inventing an arbitrary date to hang a
`DateTime` on, and makes the arithmetic in the placement packer trivial.

**Everything is UTC.** `Task.date` is UTC midnight for the day it belongs to;
`scheduledStart`/`scheduledEnd` are UTC datetimes. `lib/dates.ts` reads and
writes UTC components exclusively — using local-time getters would resolve
differently depending on the server's timezone and could shift a task into an
adjacent day or ISO week.

**`@@index([goalId, date])` on Task** supports the query every page makes:
tasks for a goal within a date range.

**Completion is stored once.** `Task.status` (`pending` / `done` / `skipped`) is
the only stored representation of whether a task is finished. An earlier version
also carried a `completed` boolean, so one fact lived in two columns synced by
hand in the update handler — they could disagree and nothing would notice. The
string won because it is strictly more expressive: it can say "skipped", which a
boolean cannot, and that distinction matters to regeneration (a skipped task is
*finished* — the user decided against it — so it is preserved rather than
silently rescheduled).

Clients still receive a `completed` boolean, but it is derived on the way out in
`lib/tasks.ts` rather than stored, so the convenience costs nothing in
consistency. The migration that removed the column backfills `status` from the
boolean first, treating the boolean as authoritative on disagreement since it is
what the UI actually rendered.

---

## Request flow: creating a goal

Goal creation is deliberately **two requests, each making at most one model
call**:

1. `POST /api/goals/clarify` — Architect generates three clarifying questions.
2. The user answers them in a chat-style wizard (`components/ChatUI.tsx`).
3. `POST /api/goals` — Architect builds the roadmap; milestones are persisted
   with the first marked `active`. The response returns as soon as the roadmap
   exists, reporting `planning.roadmap` as `llm` or `fallback` and
   `planning.schedule` as `pending`.
4. The client then calls `POST /api/schedule`, which runs `runScheduler()` across
   *all* the user's active goals — not just the new one, so the new goal is
   balanced against existing commitments rather than stacked on top.

**Why split it.** These two steps were originally one request, which meant two
sequential model calls back to back — comfortably the slowest path in the app,
and capable of exceeding a serverless function's time limit on a slow
generation. Splitting them keeps each request within one model call, lets the
user see their roadmap sooner, and makes the failure modes independent: if
scheduling fails, the goal and roadmap still exist and the week can be generated
afterwards, rather than losing the whole creation.

The client treats the second call as best-effort and redirects regardless, so a
scheduling failure degrades to an empty week rather than a failed goal.

---

## Auth

NextAuth with credentials and JWT sessions; bcrypt password hashing. `middleware.ts`
gates `/dashboard`, `/goals/*`, `/schedule`, and `/settings/*`.

Every route handler independently re-checks the session and verifies ownership
before touching a record — `middleware` proves you're logged in, not that the
goal you asked for is yours. Ownership is checked by querying through the
relation (`task.goal.userId`) rather than trusting an id from the request.

---

## Testing

`npm test` — 57 tests, no database or network required.

The suite targets the logic where bugs are silent rather than loud: week and
ISO-week-year math, the time-slot packer, the semantic validation layer, and the
contract between the deterministic fallbacks and the schemas the model is held
to. `tests/placement.test.ts` includes a regression test for a bug where
placement results were matched to their inputs positionally even though the
packer returns them grouped by day — which handed tasks each other's time slots
whenever the scheduler emitted days out of order.
