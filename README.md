# Goal Planner

AI-powered weekly goal planning app. Describe your goal, answer a few questions, and get a personalized weekly task plan. Track completions, add notes, and let AI regenerate or adjust tasks each week.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS**
- **Prisma** + **PostgreSQL**
- **NextAuth** (credentials, JWT)
- **Anthropic SDK** (with mock fallback — works without an API key)

## Quick start

```bash
# 1. Install dependencies and start the database
make setup

# 2. Start the dev server
make dev
```

Open [http://localhost:3000](http://localhost:3000).

**Demo login:** `demo@example.com` / `demo123`

## Manual setup

```bash
npm install
docker compose up -d
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random secret for JWT signing |
| `NEXTAUTH_URL` | Base URL (e.g. `http://localhost:3000`) |
| `ANTHROPIC_API_KEY` | Optional. Leave blank to use mock AI responses |

## Make targets

| Command | What it does |
|---|---|
| `make setup` | Install deps + start DB + migrate + seed |
| `make dev` | Start Next.js dev server |
| `make db-up` | Start Postgres container |
| `make db-down` | Stop Postgres container |
| `make db-reset` | Wipe DB, re-migrate, re-seed |
| `make db-migrate` | Run pending Prisma migrations |
| `make db-seed` | Seed demo data |
| `make db-studio` | Open Prisma Studio |

## Features

- **AI plan creation** — chat-style flow: enter goal → answer 3 clarifying questions → AI generates 5-7 weekly tasks
- **Mock fallback** — all AI features work without an `ANTHROPIC_API_KEY`
- **Task completion** — check off tasks with notes and metadata; saves immediately
- **Weekly regeneration** — AI builds next week's plan using last week's completions
- **Plan adjustment** — type what you want changed ("make it less intense") and AI rewrites the tasks
- **Stats & streaks** — completion rate, history bars, weekly streaks, recent notes
- **Quick view** — check off tasks directly from the dashboard without opening the plan
- **Auth** — email/password signup with bcrypt hashing, JWT sessions, protected routes
