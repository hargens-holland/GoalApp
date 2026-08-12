# Handoff: Goal Planner UI

## Overview
Goal Planner turns a stated goal into an AI-built **roadmap of milestones** and a **dated daily schedule**, produced by three agents (Architect → Progress → Scheduler). This package is the **high-fidelity UI design** for the six screens: Dashboard, Calendar, Goal detail, New-goal wizard, Availability, and Auth.

The backend, API contract, and data shapes already exist (see your original spec). The job here is to **recreate this UI in your real Next.js 14 App Router + TypeScript + Tailwind app**, wired to the documented endpoints.

## About the Design Files
`Goal Planner.dc.html` in this folder is a **design reference**, not production code to copy. It's a single self-contained HTML prototype (a small custom runtime renders it) showing the intended look, layout, and interactions on mock data. **Do not port the HTML or its runtime.** Rebuild each screen as real React Server/Client Components using your existing conventions (Tailwind classes, `next-auth/react`, your fetch/SWR/React Query patterns, etc.). Treat the HTML as the source of truth for visuals and behavior only.

Open the file in a browser to click through it. Sign in with any credentials.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions. Recreate pixel-faithfully using Tailwind. Exact tokens are listed under **Design Tokens** — translate them to your `tailwind.config` (extend `colors`, `fontFamily`) or use arbitrary values where one-off.

---

## Design Tokens

### Color
| Token | Value | Use |
|---|---|---|
| `bg` | `#0a0a0c` | App background |
| `sidebar` | `#0c0c0f` | Sidebar background |
| `card` | `#141419` | Cards / panels |
| `card-2` | `#101014` | Calendar day columns |
| `input` | `#0d0d11` | Inputs / textareas |
| `task-card` | `#16161c` | Calendar task cards |
| `elevated` | `#1c1c24` | Toast, active tab, hover-on-task-card |
| `primary` | `#6d56f0` | Primary buttons, accent |
| `primary-hover` | `#7d68ff` | Primary hover |
| `primary-soft` | `rgba(109,86,240,0.15)` | Soft accent fills (focus-banner default tint) |
| `text` | `#f4f4f5` | Primary text |
| `text-2` | `#a1a1aa` | Secondary text |
| `text-3` | `#71717a` | Muted / labels |
| `text-4` | `#52525b` | Faint microcopy |
| `border` | `rgba(255,255,255,0.06)` | Card borders |
| `border-strong` | `rgba(255,255,255,0.1)` | Inputs, ghost buttons |
| `divider` | `rgba(255,255,255,0.05)` | Row separators |

### Per-goal accent color (color-coding)
Generated in **OKLCH** so all goal colors share lightness & chroma and differ only in hue — keep this approach so any number of goals stay harmonious.

```ts
// color = `oklch(0.74 0.14 ${hue})`
// soft  = `oklch(0.74 0.14 ${hue} / 0.15)`  // tinted backgrounds
const GOAL_HUES = { /* example seeds */ guitar: 285, run: 155, saas: 245, spanish: 40, new: 330 };
```
Assign a **stable hue per goal id** (hash the id, or store an index → hue). Same color must be used everywhere that goal appears: dashboard goal list, calendar legend + task left-border, goal-detail dot/bars, sidebar dots.

### Typography
- **Sans (UI):** `Hanken Grotesk` (Google Fonts), weights 400/500/600/700. Headings use `letter-spacing: -0.01em` to `-0.02em`.
- **Mono (times, stats, dates):** `JetBrains Mono`, weights 400/500/600/700. Use for: task times (`09:00`), stat numbers, progress `%`, week-range label, calendar day numbers, availability time selects.
- Scale in use: page title 26px/700, section title 16–17px/700, card title 14.5–15.5px/600, body 13–15px/400-500, label 11px/600 uppercase `letter-spacing:0.05em`, micro 12.5px/400.

### Radius & misc
- Radius: cards `16px`, inner panels/inputs `9–14px`, pills `99px`, checkboxes `6–7px`, logo mark `9–10px`.
- Toast shadow: `0 12px 40px rgba(0,0,0,0.5)`.
- Sidebar width `248px`; main content `max-width:1200px`, padding `34px 44px 90px`.
- Spinner: 46px ring, `border-top-color:#6d56f0`, `animation: spin .8s linear infinite`.

### Logo mark
`30–34px` rounded square, `bg #6d56f0`, containing a `~11px` white square outline (`border:2.5px solid #fff; border-radius:3px`) rotated `45deg` (a diamond/target).

---

## App Shell
- **Layout:** flex row. Sticky left **sidebar** (`248px`, `#0c0c0f`, right border `border`) + scrollable **main** (`flex:1`, `height:100vh; overflow-y:auto`).
- **Sidebar contents (top→bottom):** logo + wordmark · primary **+ New goal** button · nav (`Dashboard` grid icon, `Calendar` calendar icon, `Availability` clock icon) · `GOALS` label + per-goal rows (color dot + title, click → goal detail) · spacer · **Sign out** (avatar circle + label).
- **Active nav item:** `background: rgba(255,255,255,0.07)`, text `#f4f4f5`; inactive text `#a1a1aa`, hover `background: rgba(255,255,255,0.05)`.
- In Next.js, build this as `app/(app)/layout.tsx`; use `usePathname()` for active state. Auth pages (`/login`, `/signup`) sit **outside** this shell.

---

## Screens / Views

### 1. Dashboard — `/dashboard`
- **Header:** greeting (time-of-day) + date (`Weekday, Mon D`); right-aligned `Calendar` (ghost) and `+ New goal` (primary) buttons.
- **Stats row:** 4 equal cards — **Today** `done / total` (mono), **This week** `%` completion, **Streak** `N wks` (≥50%/week), **Active goals** `N`. Card = `#141419`, radius 15px; label 11px uppercase muted; number 26px JetBrains Mono.
- **Body grid:** `grid-template-columns: 1.55fr 1fr; gap:18px; align-items:start`.
  - **Today (hero):** card header "Today" + date + `done / total done` pill. Then task rows separated by `divider`. Each row: 22px checkbox (border `rgba(255,255,255,0.22)`; when done → fill with goal color + `✓`), 44px mono time column, title+desc (done → `#6b6b73` + `line-through`), right side goal chip (dot + name) and a 30px **note** button (icon outline rect with two lines; tinted to goal color when a note exists). Clicking note button expands an inline `textarea` (indented `padding-left:80px`) under the row; on blur show a "Note saved" toast.
  - **Goals:** card listing each goal — color dot, title, mono `%`; below: active-milestone subtitle (truncated) + progress bar (track `rgba(255,255,255,0.07)`, fill = goal color, `width = progress%`). Whole row clickable → `/goals/[id]`.

### 2. Calendar — `/schedule`
- **Header:** "Calendar" title + mono week-range label (`Jun 22 – Jun 28, 2026`). Right: a segmented control `‹ | Today | ›` (in one bordered pill) and a primary **Regenerate week** button (circular-arrow icon).
- **Legend:** inline row of goal chips (9px rounded square + title).
- **Grid:** `grid-template-columns: repeat(7,1fr); gap:10px`. **Each column needs `min-width:0`** so it shrinks (otherwise Sat/Sun overflow). Column = `#101014`, radius 14px, `min-height:430px`; today's column gets border `rgba(109,86,240,0.3)`.
- **Day header:** day name + day number; today highlighted (number gets `bg rgba(109,86,240,0.18)`, white text).
- **Task card:** `#16161c`, `border-left:3px solid <goalColor>`, radius 9px; mono time in goal color, title below (done → muted + line-through). Click toggles complete. Tasks ordered by `scheduledStart`.
- **Empty week:** dashed banner prompting "Regenerate week".

### 3. Goal detail — `/goals/[id]`
- **Back** link → Dashboard.
- **Header:** goal color dot + status pill (uppercase, goal-color text on soft fill) · big goal title · goal statement (max-width 560). Right: ghost **Review progress** and **Adjust roadmap** buttons (stub → toast for now).
- **Focus banner:** full-width card tinted with goal **soft** color; label "THIS WEEK'S FOCUS" (goal color) + focus sentence.
- **Body grid:** `1.5fr 1fr; gap:18px`.
  - **Roadmap (left):** vertical timeline. Each milestone = a 26px status dot + connector line. **Done:** filled goal color + `✓`. **Active:** transparent fill, goal-color border, small goal-color inner dot. **Upcoming/locked:** faint hollow dot, title `#a1a1aa`. Each item: title + status chip (`Done`/`Active`/`Upcoming`), description, and a "Success — …" criteria box (`rgba(255,255,255,0.03)` panel).
  - **Sidebar (right):** **Overall progress** card (34px mono `%` + bar + `done/total milestones` + "where you are" summary) · **Weekly progress** card (8 bars from snapshot history; last bar full opacity, rest `0.45`) · **This week's tasks** card (compact checkable rows: 20px checkbox + mono time + title).

### 4. New goal — `/goals/new`
- Centered column, `max-width:580px`. Top: 3-segment progress bar.
- **Step 1:** label "NEW GOAL · STEP 1 OF 3" · "What do you want to achieve?" · helper text · large goal `textarea` · **Continue** (disabled/40%-opacity until >3 chars).
- **Step 2:** label "A few quick questions · N of 3" · the current question (large) · answer `textarea` · **Skip** (ghost) + **Continue / Build roadmap** (primary on last). One question at a time.
- **Step 3:** centered spinner + "Building your roadmap…" + sub-copy about Architect/Scheduler. After it resolves, **redirect to `/goals/[id]`** of the new goal.

### 5. Availability — `/settings/availability`
- `max-width:680px`. Title + explainer ("The Scheduler only places daily tasks inside these windows…").
- Card with 7 rows (**Mon→Sun** order, even though data uses `dayOfWeek 0=Sun`). Each row: toggle switch (42×24 track, `#6d56f0` on / `rgba(255,255,255,0.12)` off, 18px white knob slides `3px↔21px`) · day name (96px, muted when off) · `from` select · "to" · `to` select (mono, `#16161c`) · "Day off" tag when disabled; controls dim to `opacity:0.4` when off.
- Time selects: 30-min steps, `05:00`–`23:00` (minutes 300–1380). **Save availability** primary button → toast.

### 6. Auth — `/login`, `/signup`
- Centered logo + wordmark. Card `max-width:400px`, `#121217`.
- Segmented **Sign in / Sign up** tabs (active = `#1c1c24` fill, white text). Title ("Welcome back" / "Create your account") + subtitle. Sign-up adds a **Name** field above Email. Email + Password inputs (`#0d0d11`, focus border `#6d56f0`). Primary CTA. Microcopy below the card.

---

## Interactions & Behavior
- **Toggle task** (dashboard, calendar, goal detail) → optimistic flip, then `PATCH /api/tasks/:id { completed }`.
- **Note** → expand inline textarea; on **blur** `PATCH /api/tasks/:id { notes }` + "Note saved" toast.
- **Open goal** → navigate `/goals/[id]`.
- **Calendar week nav** (`‹`/`Today`/`›`) → refetch `GET /api/schedule?weekOffset=N`. **Regenerate week** → `POST /api/schedule { weekOffset }` then refetch.
- **New goal:** Step 1 Continue → `POST /api/goals/clarify { goal }` to get 3 questions → ask one-at-a-time (Skip allowed) → Build roadmap → `POST /api/goals { goal, clarifications }` → route to `/goals/:id`. Show the spinner step while these run.
- **Review progress** → `POST /api/goals/:id/review`; **Adjust roadmap** → `POST /api/goals/:id/adjust` (currently stubbed to a toast — wire when ready).
- **Save availability** → `PUT /api/availability { windows }`.
- **Hover:** ghost buttons → `rgba(255,255,255,0.05)`; primary → `#7d68ff`; task/goal rows → `rgba(255,255,255,0.018)`; calendar task card → `#1c1c24`.
- **Toast:** fixed bottom-center, `#1c1c24`, auto-dismiss ~2.4s.
- **Protected routes** `/dashboard`, `/goals/*`, `/schedule`, `/settings/*` → redirect to `/login` when unauthenticated (`getServerSession`).

## State Management
- Server components fetch initial data (`getServerSession` + the GET endpoints). Client components own interactive state: task `completed`/`notes` (optimistic), `weekOffset`, the new-goal wizard (`step`, `goal`, `questions[]`, `answers[]`), availability windows, auth form fields, and a small toast store.
- Time handling: all API datetimes are **UTC**. `scheduledStart: "…T09:00:00Z"` → display `09:00`. `scheduledStart: null` = day-scheduled but not time-slotted (no time shown). Sort tasks within a day by `scheduledStart`.
- Streak = consecutive recent weeks with ≥50% task completion, derived from `ProgressSnapshot` history.

## Assets
- **Fonts:** Hanken Grotesk + JetBrains Mono (Google Fonts) — add via `next/font/google`.
- **Icons:** simple inline SVGs (plus, grid, calendar, clock, chevrons, back arrow, note, refresh). Replace with your icon library (e.g. lucide-react: `Plus`, `LayoutGrid`, `Calendar`, `Clock`, `ChevronLeft/Right`, `ArrowLeft`, `StickyNote`, `RefreshCw`) if you have one.
- No raster images.

## Files
- `Goal Planner.dc.html` — the full interactive design reference (all six screens, click-through).
- `screenshots/` — static captures of each screen (if included).
