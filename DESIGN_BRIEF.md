# Goal Planner — Frontend Design Prompt

> Paste everything below into your design tool (Claude design / v0 / etc.). It contains the product concept, the live API contract, the data shapes, and the pages to design. The backend already exists and works — design the UI to consume these exact endpoints.

---

## Product

**Goal Planner** is an AI goal app. A user states a goal; three AI agents run behind the scenes:

1. **Architect** — turns the goal into a *roadmap* of sequential **milestones**.
2. **Progress** — weekly, assesses *where the user is* in the roadmap and sets the week's focus.
3. **Scheduler** — turns the current focus of all active goals into concrete **dated daily tasks**, placed inside the user's free time.

So the hierarchy is: **Goal → Milestones (roadmap) → Daily Tasks (calendar)**.

Design a clean, modern, focused productivity UI. Current aesthetic is **dark** (near-black `zinc-950` background, white text, **indigo** primary accent, subtle zinc borders, rounded-xl cards). You may keep or modernize this, but keep it dark, calm, and uncluttered. Tech: **Next.js 14 App Router + React + TypeScript + Tailwind**.

---

## Pages to design

### 1. Dashboard (`/dashboard`) — the main page
The home view. Two priorities:
- **Today** — the day's tasks across all goals, time-ordered, each with a checkbox, title, optional time (e.g. `09:00`), short description, and a "note" affordance. This is the hero of the page — make daily tasks feel great and glanceable. Show `done/total` for today.
- **Goals** — a compact list of the user's goals, each showing title, the current active milestone, and a progress bar (`progress` 0–100). Clicking a goal opens its detail page.
- Top actions: **+ New goal**, **Calendar**, **Availability**.

### 2. Calendar (`/schedule`)
A **weekly calendar** of all daily tasks across every goal — this is the "combine daily tasks into a calendar" view.
- 7 day columns (Mon–Sun). Each task is a small card placed in its day, ordered by `scheduledStart` time.
- **Color-code by goal** (stable color per goal id) with a legend.
- Week navigation: ← / Today / →, and a date range label.
- A **Regenerate week** button (re-runs the Scheduler).
- Tasks are clickable to toggle complete. Bonus: a time-grid/agenda layout using `scheduledStart`/`scheduledEnd`.

### 3. Goal detail (`/goals/[id]`)
Everything about one goal:
- Goal statement + **this week's focus** (from latest snapshot).
- **Roadmap** — a vertical timeline of milestones with status (`done` / `active` / `upcoming`), description, and success criteria.
- **This week's tasks** for this goal (checkable list).
- **Progress sidebar / stats** — overall `progress` %, "where you are" summary, weekly history.
- Actions (you can stub these visually for now — wiring comes later): **Review my progress**, **Adjust roadmap**.

### 4. New goal (`/goals/new`)
A 3-step chat-style wizard: (1) enter goal → (2) answer 3 AI clarifying questions one at a time (with skip) → (3) loading while the roadmap builds → redirect to the goal page. Show a step progress indicator.

### 5. Availability (`/settings/availability`)
A simple per-weekday form: toggle each day on/off and set a start/end time window (e.g. Mon 09:00–17:00). Explains "the Scheduler only places tasks inside these windows."

### 6. Auth (`/login`, `/signup`)
Email + password. NextAuth credentials.

### Clean stats to feature (data is available)
- Per-goal **progress %** and milestone completion (`done` milestones / total).
- **Today** done/total and **this week** completion rate.
- **Streak**: consecutive weeks with ≥50% task completion (derive from snapshot history).
- Weekly history bars from `ProgressSnapshot`.

---

## Data shapes

```ts
Goal      { id, title, goal, status: "active"|"paused"|"done", progress: number /*0-100*/, targetDate: string|null, clarifications: {question,answer}[], createdAt, updatedAt }
Milestone { id, goalId, title, description: string|null, successCriteria: string|null, order: number, targetWeekOffset: number|null, status: "locked"|"active"|"done" }
Task      { id, goalId, milestoneId: string|null, title, description: string|null,
            date: string /*ISO, UTC midnight*/, estimatedMinutes: number|null,
            scheduledStart: string|null, scheduledEnd: string|null /*ISO datetimes, UTC*/,
            status: "pending"|"done"|"skipped", order: number, completed: boolean,
            notes: string|null, metadata: object|null, completedAt: string|null }
ProgressSnapshot { id, goalId, weekNumber, year, summary: string|null, focusForWeek: string|null, currentMilestoneId: string|null }
Availability     { id, userId, dayOfWeek: 0..6 /*0=Sun*/, startMinute: number, endMinute: number /*minutes from midnight*/ }
```

> Note: all times are **UTC**. `scheduledStart` "2026-06-22T09:00:00Z" → display `09:00`. A task with `scheduledStart: null` is scheduled for the day but not time-slotted.

---

## API contract (all JSON; cookie-based NextAuth session; everything except auth/signup requires login)

**Goals**
- `GET /api/goals` → `Goal[]`, each includes `milestones: Milestone[]` and `tasks: Task[]` (this week).
- `POST /api/goals` body `{ goal: string, clarifications: {question,answer}[] }` → `{ goalId, goal: Goal }`. (Runs Architect + Scheduler.)
- `GET /api/goals/:id` → `Goal & { milestones: Milestone[], tasks: Task[] /*this week*/, snapshots: ProgressSnapshot[] /*last 8*/ }`.
- `PUT /api/goals/:id` body `{ title?, goal?, status? }` → `Goal`.
- `DELETE /api/goals/:id` → `{ ok: true }`.
- `POST /api/goals/clarify` body `{ goal: string }` → `{ questions: string[] }` (3 questions).
- `POST /api/goals/:id/review` (Progress agent) → `{ assessment: { currentMilestoneId, progressPercent, summary, focusForWeek, completedMilestoneIds: string[] }, snapshot: ProgressSnapshot }`.
- `POST /api/goals/:id/adjust` body `{ request: string, scope: "roadmap"|"week" }` → updated `Goal & { milestones, tasks }`.

**Schedule (calendar)**
- `GET /api/schedule?weekOffset=0` → `{ start: ISO, end: ISO, tasks: (Task & { goal: { id, title } })[] }`. `weekOffset` is integer weeks from current (−1 prev, +1 next).
- `POST /api/schedule` body `{ weekOffset?: number }` → `{ created: number }` (re-runs Scheduler for that week).

**Tasks**
- `PATCH /api/tasks/:id` body `{ completed?: boolean, notes?: string, metadata?: object }` → `Task`.
- `DELETE /api/tasks/:id` → `{ ok: true }`.

**Availability**
- `GET /api/availability` → `Availability[]`.
- `PUT /api/availability` body `{ windows: { dayOfWeek, startMinute, endMinute }[] }` → `Availability[]` (replaces the whole set).

**Auth**
- `POST /api/signup` body `{ email, password, name? }`.
- NextAuth at `/api/auth/[...nextauth]` (credentials). Use `next-auth/react` `signIn`/`signOut` on the client and `getServerSession` in server components.

---

## Interaction notes
- Toggling a task → `PATCH /api/tasks/:id { completed }` (optimistic update is nice).
- Saving a note → `PATCH /api/tasks/:id { notes }` on blur.
- New goal flow → `POST /api/goals/clarify` then `POST /api/goals`, then route to `/goals/:id`.
- Calendar week switch → refetch `GET /api/schedule?weekOffset=N`.
- Protected routes: `/dashboard`, `/goals/*`, `/schedule`, `/settings/*` (redirect to `/login` when unauthenticated).

Deliver: polished React/Tailwind components/pages for the screens above, wired to these endpoints. The "Adjust / change agent" actions can be visually stubbed for now.
