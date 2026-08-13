# Deployment

The live demo runs on **Vercel** (app) + **Neon** (Postgres), both on permanently
free tiers, with a subdomain delegated from Route 53 so it sits under the
portfolio domain. Total cost: $0/month.

The public deployment runs in **demo mode** — see [Why the demo has no API
key](#why-the-demo-has-no-api-key) below, which is the single most important
setting on this page.

---

## 1. Database — Neon

1. Create a project at [neon.tech](https://neon.tech) (free tier: 0.5 GB, plenty
   for this).
2. From the dashboard, copy **both** connection strings:
   - the **pooled** one (host contains `-pooler`) → `DATABASE_URL`
   - the **direct** one (no `-pooler`) → `DIRECT_URL`

Both are needed. Serverless functions each open their own connection, so runtime
queries go through the pooler or the connection limit is exhausted quickly.
Migrations can't run through a transaction pooler at all — they need DDL and
advisory locks — so `prisma migrate` uses the direct endpoint. This split is
declared in `prisma/schema.prisma`.

Make sure both URLs end with `?sslmode=require`.

---

## 2. App — Vercel

1. Import the GitHub repository at [vercel.com/new](https://vercel.com/new).
   Vercel detects Next.js automatically.
2. `vercel.json` already sets the build command to
   `prisma migrate deploy && next build`, so migrations are applied on every
   deploy. Nothing to configure manually.
3. Add these environment variables (Settings → Environment Variables):

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** string | Runtime queries |
| `DIRECT_URL` | Neon **direct** string | Migrations only |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` | Session signing. Rotating it logs everyone out. |
| `NEXTAUTH_URL` | `https://your-domain` | Must match the final public origin exactly, including the subdomain |
| `DEMO_MODE` | `true` | **See below.** Forces deterministic planning. |
| `NEXT_PUBLIC_DEMO_MODE` | `true` | Shows the one-click "Explore the demo" button |
| `ANTHROPIC_API_KEY` | *(leave unset)* | Not needed in demo mode |

4. Deploy.

### Seed the demo account

Once, from your machine, pointed at the Neon database:

```bash
DATABASE_URL="<neon-direct-url>" DIRECT_URL="<neon-direct-url>" npx tsx prisma/seed.ts
```

This creates `demo@example.com` / `demo123` with four goals, milestones, a
partially-completed current week, and two prior weeks of history so the streak
and progress stats aren't zero. It's safe to re-run — it deletes and recreates
the demo user.

---

## 3. Subdomain — Route 53

To serve the demo from your portfolio domain:

1. In Vercel: Settings → Domains → add `goals.yourdomain.com`.
2. In Route 53, open the hosted zone for `yourdomain.com` and create a record:
   - **Name**: `goals`
   - **Type**: `CNAME`
   - **Value**: `cname.vercel-dns.com`
   - **TTL**: 300
3. Wait for Vercel to verify (usually a minute or two). TLS is issued
   automatically.
4. Set `NEXTAUTH_URL` to `https://goals.yourdomain.com` and redeploy —
   authentication callbacks break if this doesn't match the real origin.

Your portfolio site keeps serving from the apex domain; only the `goals`
subdomain is delegated.

---

## Why the demo has no API key

`DEMO_MODE=true` makes every agent use its deterministic planner and never call
the Anthropic API.

This is deliberate, and it is the correct configuration for a public demo. The
app is unauthenticated at the signup boundary — anyone can create an account —
so a deployed instance holding a live API key is an open proxy to a paid API.
Any visitor could create goals in a loop and spend real money. `DEMO_MODE` makes
that structurally impossible rather than relying on rate limits.

The product remains fully explorable: roadmaps, weekly assessments, scheduling,
regeneration, and every UI surface work end to end. What a visitor sees is
deterministic planning rather than model-generated planning. The distinction is
visible in the API responses, which report `source: "llm" | "fallback"`.

To run with real model calls (locally, or on a private deployment behind auth),
set `ANTHROPIC_API_KEY` and either remove `DEMO_MODE` or set it to `false`.

---

## Operational notes

**Neon scale-to-zero.** The free tier suspends the database after ~5 minutes
idle. The first request afterwards pays a wake-up cost of roughly half a second.
Subsequent requests are normal. Nothing to configure; just don't be surprised by
one slow first load.

**Vercel cold starts.** Functions cold-start in a few hundred milliseconds. There
is no scheduled sleep on the free tier — unlike some hosts, the app doesn't go
down after inactivity, which is why this pairing was chosen for an always-on
portfolio link.

**Function timeout.** Vercel's free tier caps functions at 60 seconds. This
matters only when running with a real API key: `POST /api/goals` makes two
sequential model calls (Architect, then Scheduler) in a single request, which
can approach that limit on a slow generation. In demo mode there are no model
calls, so it's a non-issue for the public deployment. On a private deployment
with a key, split the scheduling step into a separate request or move it to a
background job.

**Migrations.** `prisma migrate deploy` runs on every deploy via `vercel.json`.
It only applies migrations that haven't run yet, so redeploys are safe. It never
generates new migrations — those are created locally with `prisma migrate dev`
and committed.

**Rotating secrets.** `NEXTAUTH_SECRET` can be rotated at any time; the only
effect is that existing sessions are invalidated. If an `ANTHROPIC_API_KEY` is
ever added and later exposed, revoke it in the Anthropic console — changing the
environment variable alone doesn't invalidate the old key.

---

## Self-hosting elsewhere

Nothing here is Vercel-specific beyond `vercel.json`. The app is a standard
Next.js server needing a Postgres URL and the environment variables above. On a
container host:

```bash
npm ci
npx prisma migrate deploy
npm run build
npm start
```

`docker-compose.yml` in the repo root is for local Postgres only — it does not
build or run the app.
