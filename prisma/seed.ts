import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { pickHue } from "../lib/colors";
import { eachDate, fromISODate, getWeekInfo, getWeekRange, toISODate } from "../lib/dates";
import { getAvailability, placeTasks, runScheduler } from "../lib/scheduling";
import { generateRoadmap } from "../lib/agents/architect";
import { assessProgress } from "../lib/agents/progress";
import { isDemoMode } from "../lib/agents/client";

/**
 * Seeds the demo account.
 *
 * This is what a visitor sees when they click "Look around the demo", so it
 * aims to look like an account in genuine use: four goals at different
 * stages, eight weeks of history with a believable completion pattern, and a
 * current week that is partly done.
 *
 * THE RULE THIS FILE MUST OBEY
 *
 * Every task is placed through the same code path the Scheduler uses
 * (`placeTasks` against the user's real availability). The seed never writes a
 * time of day by hand. An earlier version did, and the demo calendar showed a
 * 07:00 run and an 18:00 practice session on an account whose availability was
 * 09:00–17:00 at the time — directly contradicting what the Availability page promises.
 * `assertWithinAvailability` at the end re-checks every row so that regression
 * cannot come back quietly.
 *
 * WHAT IS AUTHORED AND WHAT IS GENERATED
 *
 * Demo mode has no model, and the deterministic planners produce generic
 * output by design ("Practice block: Clean chord transitions"). So the goal
 * statements, roadmaps, session templates, and review summaries below are
 * written by hand — that is the only way a demo without an API key can show
 * domain-specific content. Placement, statuses, completion history, and
 * progress are all computed.
 *
 * With `SEED_LIVE=true` and an API key, the roadmaps come from the Architect,
 * the current week from the Scheduler, and each goal's review from the
 * Progress agent. Use that locally to see what real output looks like.
 *
 * Safe to re-run — it deletes and recreates the demo user each time.
 */

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo123";

const LIVE = process.env.SEED_LIVE === "true" && !isDemoMode();

/** Monday of the current week, at UTC midnight. */
const { start: THIS_MONDAY } = getWeekRange();
const TODAY = toISODate(new Date());

/** A UTC date offset from this Monday by whole days. */
function day(offsetDays: number): Date {
  const d = new Date(THIS_MONDAY);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

// ---------------------------------------------------------------------------
// Authored content
// ---------------------------------------------------------------------------

interface Session {
  title: string;
  description: string;
  minutes: number;
  /** 1 = Monday … 6 = Saturday. */
  weekday: number;
}

interface SeedGoal {
  title: string;
  goal: string;
  /** How long ago the goal was created. Drives milestone status and history. */
  startedWeeksAgo: number;
  clarifications: { question: string; answer: string }[];
  milestones: { title: string; description: string; successCriteria: string; targetWeekOffset: number }[];
  /** The weekly routine. Cycled through history with light variation. */
  sessions: Session[];
  /** Share of sessions completed in a normal week. */
  completionRate: number;
  /** Weeks-ago that went badly, for a realistic dip. */
  badWeeks: number[];
  notes: string[];
  progress: number;
  focusForWeek: string;
  summary: string;
}

const GOALS: SeedGoal[] = [
  {
    title: "Run a half marathon",
    goal: "Run a half marathon in under two hours by the end of the year",
    startedWeeksAgo: 9,
    clarifications: [
      { question: "What's your current running base?", answer: "About 15 km a week, comfortable with a 5K" },
      { question: "How many days a week can you train?", answer: "Four, with the long run on Saturday" },
      { question: "Any injuries to work around?", answer: "Mild runner's knee last year" },
    ],
    milestones: [
      { title: "Build an aerobic base", description: "Get to 25 km a week at conversational pace without knee pain.", successCriteria: "Four consecutive weeks at 25 km+ with no flare-ups.", targetWeekOffset: 0 },
      { title: "Extend the long run to 12K", description: "Stretch Saturday's run while keeping midweek genuinely easy.", successCriteria: "A 12 km long run at conversational pace.", targetWeekOffset: 6 },
      { title: "Add tempo and threshold work", description: "Introduce structured speed work to lift race pace.", successCriteria: "Hold 5:20/km for 8 km in a tempo session.", targetWeekOffset: 12 },
      { title: "Taper and race", description: "Reduce volume, sharpen, and run the race.", successCriteria: "Half marathon finished under two hours.", targetWeekOffset: 18 },
    ],
    sessions: [
      { title: "Easy 5K", description: "Conversational pace. Nose-breathing only.", minutes: 35, weekday: 1 },
      { title: "Intervals 6×400 m", description: "400 m hard, 90 s jog recovery.", minutes: 45, weekday: 3 },
      { title: "Easy 6K", description: "Recovery pace, keep the heart rate low.", minutes: 40, weekday: 5 },
      { title: "Long run", description: "Conversational the whole way. Walk breaks are fine.", minutes: 80, weekday: 6 },
    ],
    completionRate: 0.85,
    badWeeks: [4],
    notes: ["Felt easy. Knee fine.", "Hit 1:48 average on the reps.", "Legs heavy from yesterday.", "Cut it short — knee twinge, nothing serious.", "Best long run yet."],
    progress: 42,
    focusForWeek: "Extend the long run to 12 km while keeping midweek runs genuinely easy.",
    summary: "Base building held up and the knee has been quiet for six weeks. Long-run distance is the limiter now, not fitness.",
  },
  {
    title: "Learn fingerstyle guitar",
    goal: "Play three fingerstyle songs cleanly from memory",
    startedWeeksAgo: 8,
    clarifications: [
      { question: "What's your current playing level?", answer: "Two years of strumming, no fingerstyle" },
      { question: "How much can you practise?", answer: "About 30 minutes, three or four days a week" },
      { question: "Any particular songs in mind?", answer: "Blackbird, and something by Tommy Emmanuel eventually" },
    ],
    milestones: [
      { title: "Independent thumb", description: "Hold a steady alternating bass while the fingers play melody.", successCriteria: "An alternating bass through a chord progression without losing time.", targetWeekOffset: 0 },
      { title: "Clean chord transitions", description: "Move between shapes without buzzing or breaking rhythm.", successCriteria: "The Blackbird intro at 80% speed, clean.", targetWeekOffset: 5 },
      { title: "First song end to end", description: "Memorise and perform one full arrangement.", successCriteria: "Blackbird start to finish from memory.", targetWeekOffset: 10 },
      { title: "Two more songs", description: "Add two arrangements at a similar level.", successCriteria: "Three songs played back to back without the sheet.", targetWeekOffset: 16 },
    ],
    sessions: [
      { title: "Chord transition drills", description: "G → C → D at 60 bpm, clean landings.", minutes: 30, weekday: 2 },
      { title: "Blackbird, section A", description: "First eight bars, slow and clean.", minutes: 30, weekday: 4 },
      { title: "Travis picking patterns", description: "Alternating bass over three shapes.", minutes: 30, weekday: 5 },
    ],
    completionRate: 0.7,
    badWeeks: [6],
    notes: ["Cleaner. Still buzzing on the C.", "Bar 4 keeps breaking the rhythm.", "Metronome at 64 today — progress.", "Fingers sore, kept it short."],
    progress: 36,
    focusForWeek: "Drill the two chord changes that keep breaking the rhythm in bar 4.",
    summary: "Thumb independence is solid now. Transitions are the bottleneck — the rhythm breaks at the same two changes every time.",
  },
  {
    title: "Ship the FocusFlow MVP",
    goal: "Launch a working MVP of my focus-tracking side project",
    startedWeeksAgo: 5,
    clarifications: [
      { question: "What's the smallest useful version?", answer: "Timer, session history, and a weekly summary" },
      { question: "How much time per week?", answer: "Maybe six hours" },
      { question: "When do you want it launched?", answer: "Within two months" },
    ],
    milestones: [
      { title: "Scope and data model", description: "Decide what's in, what's out, and how sessions are stored.", successCriteria: "A one-page scope doc and a schema that fits it.", targetWeekOffset: 0 },
      { title: "Core timer, persisted", description: "Start, stop, and save a focus session end to end.", successCriteria: "A session survives a page reload.", targetWeekOffset: 3 },
      { title: "Dashboard and weekly summary", description: "Visualise session history and weekly totals.", successCriteria: "The dashboard shows real session data over time.", targetWeekOffset: 6 },
      { title: "Auth, polish, launch", description: "Add accounts, fix the rough edges, deploy.", successCriteria: "Deployed and usable by someone who isn't me.", targetWeekOffset: 9 },
    ],
    sessions: [
      { title: "Timer UI", description: "Start, pause, reset. Persistence next.", minutes: 90, weekday: 2 },
      { title: "Session storage", description: "Schema, write path, and a reload test.", minutes: 90, weekday: 4 },
    ],
    completionRate: 0.6,
    badWeeks: [],
    notes: ["Scope doc done. Cut the tagging feature.", "Prisma schema sketched, not wired.", "Timer works. Nothing saved yet."],
    progress: 31,
    focusForWeek: "Get the core timer persisting sessions end to end.",
    summary: "Scope is settled and the data model is sketched. Nothing is persisted yet, so that's the whole focus this week.",
  },
  {
    title: "Conversational Spanish",
    goal: "Hold a 15-minute conversation in Spanish without switching to English",
    startedWeeksAgo: 3,
    clarifications: [
      { question: "What's your current level?", answer: "Two years in school, mostly forgotten" },
      { question: "How much time can you commit?", answer: "20 minutes most days" },
      { question: "Do you have anyone to practise with?", answer: "A colleague who's a native speaker" },
    ],
    milestones: [
      { title: "Rebuild core vocabulary", description: "Recover the everyday words and present-tense verbs.", successCriteria: "500 common words recalled reliably.", targetWeekOffset: 0 },
      { title: "Past and future tenses", description: "Talk about things that already happened or haven't yet.", successCriteria: "Describe last weekend without stopping to translate.", targetWeekOffset: 6 },
      { title: "Sustained conversation", description: "Hold a real conversation at natural speed.", successCriteria: "15 minutes with a native speaker, no English.", targetWeekOffset: 12 },
    ],
    sessions: [
      { title: "Vocabulary: 20 new words", description: "Spaced repetition. Food and travel this week.", minutes: 20, weekday: 1 },
      { title: "Present-tense drills", description: "Regular -ar, -er, -ir conjugations.", minutes: 25, weekday: 2 },
      { title: "Listening: slow podcast", description: "One episode, note unfamiliar words.", minutes: 25, weekday: 3 },
      { title: "Speaking drill", description: "Describe your day out loud for five minutes.", minutes: 20, weekday: 4 },
    ],
    completionRate: 0.75,
    badWeeks: [],
    notes: ["Food vocabulary sticking well.", "Understood maybe half the podcast.", "Talked to Marta for four minutes before switching."],
    progress: 14,
    focusForWeek: "Present-tense verbs and daily vocabulary review.",
    summary: "Vocabulary is coming back faster than expected. Listening comprehension is lagging well behind reading.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Small deterministic PRNG so the demo history is the same on every seed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Milestone statuses from where "now" falls on the roadmap's week axis.
 * Consistent with the timeline the goal page draws: the milestone whose
 * window contains the current week is active, earlier ones are done.
 */
function statusFor(offsets: number[], index: number, weeksElapsed: number): "done" | "active" | "locked" {
  const startsAt = offsets[index];
  const nextStartsAt = offsets[index + 1] ?? Infinity;
  if (weeksElapsed >= nextStartsAt) return "done";
  if (weeksElapsed >= startsAt) return "active";
  return "locked";
}

interface PendingTask {
  goalId: string;
  milestoneId: string;
  title: string;
  description: string;
  /** YYYY-MM-DD */
  date: string;
  estimatedMinutes: number;
  done: boolean;
  notes: string | null;
}

/**
 * Persist a batch of tasks for one week, slotting them into the user's free
 * windows exactly as the Scheduler would. Throws if any task does not fit:
 * demo data that breaks the app's own rule is a bug, not a warning.
 */
async function placeAndInsert(userId: string, weekStart: Date, tasks: PendingTask[]) {
  if (!tasks.length) return 0;
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  const availability = await getAvailability(userId, weekStart, weekEnd);
  const placed = placeTasks(
    tasks.map((t, i) => ({ id: String(i), date: t.date, estimatedMinutes: t.estimatedMinutes })),
    availability
  );
  const slotById = new Map(placed.map((p) => [p.id, p]));

  const rows = tasks.map((t, i) => {
    const slot = slotById.get(String(i))!;
    if (!slot.scheduledStart || !slot.scheduledEnd) {
      throw new Error(
        `Seed task "${t.title}" on ${t.date} does not fit the demo user's availability. ` +
          `Fix the session's weekday or duration rather than writing a time by hand.`
      );
    }
    return {
      goalId: t.goalId,
      milestoneId: t.milestoneId,
      title: t.title,
      description: t.description,
      date: fromISODate(t.date),
      estimatedMinutes: t.estimatedMinutes,
      scheduledStart: slot.scheduledStart,
      scheduledEnd: slot.scheduledEnd,
      order: i,
      status: t.done ? "done" : "pending",
      notes: t.notes,
      completedAt: t.done ? slot.scheduledEnd : null,
    };
  });
  await prisma.task.createMany({ data: rows });
  return rows.length;
}

/** Re-read every task and prove it sits inside an availability window. */
async function assertWithinAvailability(userId: string) {
  const windows = await prisma.availability.findMany({ where: { userId } });
  const tasks = await prisma.task.findMany({
    where: { goal: { userId } },
    select: { title: true, date: true, scheduledStart: true, scheduledEnd: true },
  });
  const violations: string[] = [];
  for (const t of tasks) {
    if (!t.scheduledStart || !t.scheduledEnd) {
      violations.push(`${toISODate(t.date)} ${t.title}: not slotted`);
      continue;
    }
    const dow = t.date.getUTCDay();
    const s = t.scheduledStart.getUTCHours() * 60 + t.scheduledStart.getUTCMinutes();
    const e = t.scheduledEnd.getUTCHours() * 60 + t.scheduledEnd.getUTCMinutes();
    const ok = windows.some((w) => w.dayOfWeek === dow && s >= w.startMinute && e <= w.endMinute);
    if (!ok) violations.push(`${toISODate(t.date)} ${t.title}: ${s}–${e} outside availability`);
  }
  if (violations.length) {
    throw new Error(`Seed produced tasks outside availability:\n  ${violations.join("\n  ")}`);
  }
  return tasks.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(LIVE ? "Seeding with live agents (SEED_LIVE=true)." : "Seeding with authored content.");

  // Cascades remove goals, milestones, tasks, snapshots, and availability.
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      password: await bcrypt.hash(DEMO_PASSWORD, 10),
      name: "Demo",
    },
  });

  // Weekday mornings before work, 07:00–10:00, plus Saturday 08:00–12:00.
  // Sunday off. Narrow on purpose: side goals get a few hours, not a workday.
  await prisma.availability.createMany({
    data: [
      ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({ userId: user.id, dayOfWeek, startMinute: 420, endMinute: 600 })),
      { userId: user.id, dayOfWeek: 6, startMinute: 480, endMinute: 720 },
    ],
  });

  const random = rng(20260915);
  const hues: number[] = [];
  const created: { seed: SeedGoal; goalId: string; activeMilestoneId: string }[] = [];

  // Tasks are grouped by week so each week is placed as one batch, the way
  // the Scheduler places a week.
  const historyByWeek = new Map<number, PendingTask[]>();

  for (const seed of GOALS) {
    const hue = pickHue(hues);
    hues.push(hue);
    const createdAt = day(-7 * seed.startedWeeksAgo);

    // Roadmap: authored, or from the Architect in live mode.
    let milestones = seed.milestones;
    if (LIVE) {
      const { data, source } = await generateRoadmap(seed.goal, seed.clarifications);
      console.log(`  architect  ${seed.title}: ${source}`);
      if (source === "llm") {
        milestones = data.milestones
          .sort((a, b) => a.order - b.order)
          .map((m) => ({ title: m.title, description: m.description, successCriteria: m.successCriteria, targetWeekOffset: m.targetWeekOffset }));
      }
    }
    const offsets = milestones.map((m) => m.targetWeekOffset);

    const goal = await prisma.goal.create({
      data: {
        title: seed.title,
        goal: seed.goal,
        hue,
        userId: user.id,
        progress: seed.progress,
        clarifications: seed.clarifications,
        createdAt,
        milestones: {
          create: milestones.map((m, order) => ({
            title: m.title,
            description: m.description,
            successCriteria: m.successCriteria,
            order,
            targetWeekOffset: m.targetWeekOffset,
            status: statusFor(offsets, order, seed.startedWeeksAgo),
          })),
        },
      },
      include: { milestones: { orderBy: { order: "asc" } } },
    });
    const active = goal.milestones.find((m) => m.status === "active") ?? goal.milestones[0];
    created.push({ seed, goalId: goal.id, activeMilestoneId: active.id });

    // History: one routine per past week since the goal started, with a
    // completion pattern that varies week to week. Each task is attached to
    // the milestone that was active in that week.
    for (let weeksAgo = seed.startedWeeksAgo; weeksAgo >= 1; weeksAgo--) {
      const elapsedThen = seed.startedWeeksAgo - weeksAgo;
      const milestoneThen =
        goal.milestones.find((m, i) => statusFor(offsets, i, elapsedThen) === "active") ?? goal.milestones[0];
      const rate = seed.badWeeks.includes(weeksAgo) ? 0.3 : seed.completionRate;
      const list = historyByWeek.get(weeksAgo) ?? [];
      for (const s of seed.sessions) {
        const done = random() < rate;
        list.push({
          goalId: goal.id,
          milestoneId: milestoneThen.id,
          title: s.title,
          description: s.description,
          date: toISODate(day(-7 * weeksAgo + (s.weekday - 1))),
          estimatedMinutes: s.minutes,
          done,
          notes: done && random() < 0.35 ? seed.notes[Math.floor(random() * seed.notes.length)] : null,
        });
      }
      historyByWeek.set(weeksAgo, list);
    }
  }

  let taskCount = 0;
  for (const [weeksAgo, tasks] of Array.from(historyByWeek.entries())) {
    taskCount += await placeAndInsert(user.id, day(-7 * weeksAgo), tasks);
  }

  // Weekly review for each goal: authored, or from the Progress agent.
  const { weekNumber, year } = getWeekInfo(THIS_MONDAY);
  for (const { seed, goalId, activeMilestoneId } of created) {
    let summary = seed.summary;
    let focusForWeek = seed.focusForWeek;
    let progress = seed.progress;
    let currentMilestoneId = activeMilestoneId;

    if (LIVE) {
      const goal = await prisma.goal.findUniqueOrThrow({
        where: { id: goalId },
        include: {
          milestones: { orderBy: { order: "asc" } },
          tasks: { where: { date: { gte: day(-14), lt: THIS_MONDAY } }, orderBy: { date: "asc" } },
        },
      });
      const { data, source } = await assessProgress(
        goal.goal,
        goal.milestones.map((m) => ({ id: m.id, title: m.title, successCriteria: m.successCriteria, order: m.order, status: m.status })),
        goal.tasks.map((t) => ({ title: t.title, completed: t.status === "done", notes: t.notes }))
      );
      console.log(`  progress   ${seed.title}: ${source}`);
      if (source === "llm") {
        summary = data.summary;
        focusForWeek = data.focusForWeek;
        progress = data.progressPercent;
        currentMilestoneId = data.currentMilestoneId ?? activeMilestoneId;
        await prisma.goal.update({ where: { id: goalId }, data: { progress } });
      }
    }

    await prisma.progressSnapshot.create({
      data: { goalId, weekNumber, year, summary, focusForWeek, currentMilestoneId },
    });
  }

  // The current week: from the Scheduler in live mode, otherwise the authored
  // routine placed the same way history was.
  if (LIVE) {
    const { start, end } = getWeekRange();
    const result = await runScheduler(user.id, start, end);
    console.log(`  scheduler  this week: ${result.source}, ${result.created} tasks`);
    taskCount += result.created;
  } else {
    const thisWeek: PendingTask[] = [];
    for (const { seed, goalId, activeMilestoneId } of created) {
      for (const s of seed.sessions) {
        thisWeek.push({
          goalId,
          milestoneId: activeMilestoneId,
          title: s.title,
          description: s.description,
          date: toISODate(day(s.weekday - 1)),
          estimatedMinutes: s.minutes,
          done: false,
          notes: null,
        });
      }
    }
    taskCount += await placeAndInsert(user.id, THIS_MONDAY, thisWeek);
  }

  // Whatever produced this week's tasks, the days that have already passed
  // should look lived-in: most of them done, a few with notes.
  const past = eachDate(THIS_MONDAY, new Date()).filter((d) => d < TODAY);
  const weekTasks = await prisma.task.findMany({
    where: { goal: { userId: user.id }, date: { gte: THIS_MONDAY }, status: "pending" },
    include: { goal: { select: { title: true } } },
  });
  for (const t of weekTasks) {
    const iso = toISODate(t.date);
    const isPast = past.includes(iso);
    const isToday = iso === TODAY;
    if (!isPast && !isToday) continue;
    if (random() < (isPast ? 0.8 : 0.4)) {
      const seed = GOALS.find((g) => g.title === t.goal.title);
      await prisma.task.update({
        where: { id: t.id },
        data: {
          status: "done",
          completedAt: t.scheduledEnd,
          notes: seed && random() < 0.4 ? seed.notes[Math.floor(random() * seed.notes.length)] : null,
        },
      });
    }
  }

  const checked = await assertWithinAvailability(user.id);

  console.log("");
  console.log("Seeded the demo account.");
  console.log(`  Sign in   ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Goals     ${GOALS.length}, started ${GOALS.map((g) => `${g.startedWeeksAgo}w`).join(", ")} ago`);
  console.log(`  Tasks     ${taskCount} across ${historyByWeek.size + 1} weeks`);
  console.log(`  Verified  ${checked} tasks sit inside the user's availability windows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
