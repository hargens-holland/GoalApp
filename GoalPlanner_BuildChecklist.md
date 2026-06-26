# Goal Planner — Build Checklist
*Each step leaves you with something working. Check them off as you go.*

---

## Phase 1: Project Setup

### Step 1 — Initialize the project
- Create a new Next.js app with TypeScript: `npx create-next-app@latest goal-planner --typescript --tailwind`
- Set up your folder structure: `/app`, `/components`, `/lib`, `/prisma`
- Initialize a git repo and make your first commit
- ✅ **Done when:** Project runs locally at `localhost:3000`

---

### Step 2 — Set up the database
- Add Docker Compose file with a Postgres container
- Run `make db-up` (or `docker compose up -d`) to start the DB
- Install Prisma: `npm install prisma @prisma/client`
- Run `npx prisma init` to generate your `schema.prisma`
- ✅ **Done when:** Postgres is running and Prisma can connect to it

---

### Step 3 — Define the database schema
- Add all five models to `schema.prisma`: `User`, `Plan`, `Task`, `WeeklySnapshot`, `TaskCompletion`
- Run `npx prisma migrate dev --name init` to create the tables
- Run `npx prisma studio` to verify all tables exist
- ✅ **Done when:** All tables are visible in Prisma Studio with correct fields and relationships

---

### Step 4 — Seed the database
- Create a `/prisma/seed.ts` file
- Add a demo user with 1 plan, a few tasks, and a weekly snapshot
- Run `npx prisma db seed`
- ✅ **Done when:** Demo data shows up in Prisma Studio

---

## Phase 2: Authentication

### Step 5 — Set up NextAuth
- Install NextAuth: `npm install next-auth`
- Create `/app/api/auth/[...nextauth]/route.ts`
- Configure credentials provider (email + password, plaintext for now)
- Add `NEXTAUTH_SECRET` to your `.env`
- ✅ **Done when:** You can call the auth API without errors

---

### Step 6 — Build the login and signup pages
- Create `/app/login/page.tsx` with an email + password form
- Create `/app/signup/page.tsx` with a registration form
- Wire both to your NextAuth credentials provider
- Add basic error handling (wrong password, user not found, etc.)
- ✅ **Done when:** You can register a new user and log in with their credentials

---

### Step 7 — Protect routes
- Add a middleware file (`middleware.ts`) that redirects unauthenticated users to `/login`
- Make the dashboard and all plan pages require a logged-in session
- ✅ **Done when:** Visiting `/dashboard` without being logged in redirects you to `/login`

---

## Phase 3: Core Pages & UI

### Step 8 — Build the dashboard page
- Create `/app/dashboard/page.tsx`
- Fetch and display all plans for the logged-in user
- Show a summary card per plan with title and this week's task count
- Add a "Create New Plan" button
- ✅ **Done when:** Dashboard loads and shows the seeded demo plan

---

### Step 9 — Build the plan detail page
- Create `/app/plans/[id]/page.tsx`
- Fetch the plan and its tasks for the current week
- Display tasks in a list with checkboxes
- Add metadata fields for goal-specific tasks (e.g. weight lifted)
- Add a notes/comments field per task
- ✅ **Done when:** You can click a plan from the dashboard and see its tasks

---

### Step 10 — Task completion logging
- Wire up the checkboxes to POST to `/weekly` (creates or updates a `TaskCompletion` record)
- Save metadata and notes to the database on change
- ✅ **Done when:** Checking a task off saves to the DB and persists on page refresh

---

## Phase 4: API Routes

### Step 11 — Plans API
- Create `/app/api/plans/route.ts` — GET (list plans) and POST (create plan)
- Create `/app/api/plans/[id]/route.ts` — GET (single plan) and PUT (update plan)
- ✅ **Done when:** You can create and retrieve plans via API (test with Postman or browser)

---

### Step 12 — Tasks API
- Create `/app/api/plans/[id]/tasks/route.ts` — GET and POST
- ✅ **Done when:** You can add and list tasks for a plan via API

---

### Step 13 — Weekly API
- Create `/app/api/weekly/route.ts` — POST to log completions for the week
- Create `/app/api/weekly/[id]/route.ts` — GET a weekly snapshot with its completions
- ✅ **Done when:** Task completions save and retrieve correctly

---

## Phase 5: AI Integration

### Step 14 — Set up Anthropic API
- Install the Anthropic SDK: `npm install @anthropic-ai/sdk`
- Add `ANTHROPIC_API_KEY` to your `.env`
- Create a mock fallback in `/lib/ai.ts` that returns a fake plan when no API key is set
- ✅ **Done when:** Calling your AI helper function returns a plan (real or mocked)

---

### Step 15 — AI plan creation
- Build the plan creation flow: user enters their goal, AI asks clarifying questions in a chat-style UI
- Once enough info is gathered, call the Anthropic API to generate the initial weekly plan
- Save the generated tasks to the DB
- ✅ **Done when:** You can describe a goal, answer a few questions, and see a generated plan appear on your dashboard

---

### Step 16 — Weekly regeneration
- Create `/app/api/plans/[id]/regenerate/route.ts`
- Pull last week's `WeeklySnapshot` + `TaskCompletions` (what was done, metadata, notes)
- Build a prompt that includes the original goal + last week's data
- Call Anthropic API and save the new tasks for the upcoming week
- ✅ **Done when:** Hitting regenerate produces a new weekly plan that reflects last week's progress

---

### Step 17 — Manual plan adjustment
- Create `/app/api/plans/[id]/adjust/route.ts`
- Add an "Adjust my plan" button + text input on the plan detail page
- User types what they want changed, AI updates the plan accordingly
- ✅ **Done when:** Typing "make it less intense this week" updates the tasks in the DB and re-renders the plan

---

## Phase 6: Polish & Extras

### Step 18 — Progress and stats view
- Add a stats section to the plan detail page
- Show: tasks completed this week, completion rate, streaks, notes history
- ✅ **Done when:** You can see a simple progress summary for each plan

---

### Step 19 — Dashboard task quick-view
- On the dashboard, show this week's tasks for each plan inline
- Allow checking tasks off directly from the dashboard without going into the plan
- ✅ **Done when:** You can check off a task from the dashboard and it saves

---

### Step 20 — Upgrade auth (password hashing)
- Install bcrypt: `npm install bcryptjs`
- Hash passwords on signup, compare on login
- ✅ **Done when:** Passwords are no longer stored in plaintext

---

### Step 21 — Error handling & loading states
- Add loading spinners for AI generation steps
- Add error messages for failed API calls
- Handle edge cases: no plans yet, empty weeks, AI timeout
- ✅ **Done when:** App handles errors gracefully without crashing

---

### Step 22 — Final cleanup & deploy prep
- Review all `.env` variables and document them in `.env.example`
- Write a `README.md` with setup instructions
- Clean up any dead code or console logs
- ✅ **Done when:** Someone else could clone the repo and get it running from your README

---

## Quick Reference — What Each Phase Unlocks

| Phase | What you can do after |
|---|---|
| Phase 1 | App runs, DB is up, schema exists |
| Phase 2 | Users can register and log in |
| Phase 3 | Users can view plans and log task completions |
| Phase 4 | Full API layer is working |
| Phase 5 | AI generates, regenerates, and adjusts plans |
| Phase 6 | App is polished and ready to show off |
