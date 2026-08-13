import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getWeekInfo, getWeekRange } from "../lib/dates";

/**
 * Seeds the demo account.
 *
 * This is what a visitor sees when they click "Try the demo", so it aims to look
 * like an account in genuine use rather than a fresh install: several goals at
 * different stages, a partially-completed current week, and enough history for
 * the streak and progress stats to be non-zero.
 *
 * Safe to re-run — it deletes and recreates the demo user each time.
 */

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo123";

/** Monday of the current week, at UTC midnight. */
const { start: THIS_MONDAY } = getWeekRange();

/** A day offset from this Monday, at UTC midnight. */
function day(offsetDays: number): Date {
  const d = new Date(THIS_MONDAY);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

/** A UTC datetime on the given day, from minutes past midnight. */
function at(date: Date, minutes: number): Date {
  const d = new Date(date);
  d.setUTCMinutes(minutes);
  return d;
}

interface SeedTask {
  /** Days from this Monday. Negative values are previous weeks. */
  offset: number;
  title: string;
  description: string;
  /** Minutes past midnight, UTC. */
  startMinute: number;
  minutes: number;
  done: boolean;
  notes?: string;
}

interface SeedGoal {
  title: string;
  goal: string;
  progress: number;
  clarifications: { question: string; answer: string }[];
  milestones: {
    title: string;
    description: string;
    successCriteria: string;
    status: "done" | "active" | "locked";
  }[];
  focusForWeek: string;
  summary: string;
  tasks: SeedTask[];
}

const GOALS: SeedGoal[] = [
  {
    title: "Run a half marathon",
    goal: "Run a half marathon in under 2 hours by the end of the year",
    progress: 64,
    clarifications: [
      { question: "What's your current running base?", answer: "About 15km a week, comfortable with 5K" },
      { question: "How many days a week can you train?", answer: "Four, with long runs on Saturday" },
      { question: "Any injuries to work around?", answer: "Mild runner's knee last year" },
    ],
    milestones: [
      {
        title: "Build an aerobic base",
        description: "Get to 25km a week at conversational pace without knee pain.",
        successCriteria: "Four consecutive weeks at 25km+ with no pain flare-ups.",
        status: "done",
      },
      {
        title: "Build a 12K long-run base",
        description: "Extend the Saturday long run while keeping midweek easy.",
        successCriteria: "Complete a 12K long run at conversational pace.",
        status: "active",
      },
      {
        title: "Add tempo and threshold work",
        description: "Introduce structured speed work to lift race pace.",
        successCriteria: "Hold 5:20/km for 8km in a tempo session.",
        status: "locked",
      },
      {
        title: "Taper and race",
        description: "Reduce volume, sharpen, and run the race.",
        successCriteria: "Half marathon completed under 2 hours.",
        status: "locked",
      },
    ],
    focusForWeek: "Extend the long run to 12K while keeping midweek runs genuinely easy.",
    summary:
      "Base building is holding up well and the knee has been quiet for six weeks. Long-run distance is the limiter now, not fitness.",
    tasks: [
      { offset: 0, title: "Easy 5K", description: "Conversational pace. Nose-breathing only.", startMinute: 420, minutes: 35, done: true, notes: "Felt easy. Knee fine." },
      { offset: 2, title: "Intervals 6x400m", description: "400m hard, 90s jog recovery.", startMinute: 420, minutes: 45, done: true, notes: "Hit 1:48 average." },
      { offset: 3, title: "Easy 5K", description: "Recovery pace, keep the heart rate low.", startMinute: 420, minutes: 35, done: false },
      { offset: 4, title: "Tempo run intervals", description: "3x8 min at threshold, 2 min jog between.", startMinute: 420, minutes: 50, done: false },
      { offset: 5, title: "Long run 12K", description: "Conversational the whole way. Walk breaks are fine.", startMinute: 480, minutes: 80, done: false },
      // Previous weeks, for the streak and history charts.
      { offset: -7, title: "Long run 11K", description: "Steady effort.", startMinute: 480, minutes: 75, done: true },
      { offset: -6, title: "Easy 5K", description: "Recovery pace.", startMinute: 420, minutes: 35, done: true },
      { offset: -5, title: "Intervals 5x400m", description: "Speed work.", startMinute: 420, minutes: 40, done: true },
      { offset: -14, title: "Long run 10K", description: "Steady effort.", startMinute: 480, minutes: 70, done: true },
      { offset: -13, title: "Easy 5K", description: "Recovery pace.", startMinute: 420, minutes: 35, done: true },
      { offset: -12, title: "Hill repeats", description: "8x60s uphill.", startMinute: 420, minutes: 40, done: false },
    ],
  },
  {
    title: "Learn fingerstyle guitar",
    goal: "Play three fingerstyle songs cleanly from memory",
    progress: 38,
    clarifications: [
      { question: "What's your current playing level?", answer: "Two years of strumming, no fingerstyle" },
      { question: "How much can you practise daily?", answer: "About 30 minutes on weekdays" },
      { question: "Any particular songs in mind?", answer: "Blackbird, and something by Tommy Emmanuel eventually" },
    ],
    milestones: [
      {
        title: "Independent thumb",
        description: "Hold a steady alternating bass while the fingers play melody.",
        successCriteria: "Play an alternating bass through a chord progression without losing time.",
        status: "done",
      },
      {
        title: "Clean chord transitions",
        description: "Move between shapes without buzzing or breaking rhythm.",
        successCriteria: "Play through the Blackbird intro at 80% speed cleanly.",
        status: "active",
      },
      {
        title: "First song end to end",
        description: "Memorise and perform one full arrangement.",
        successCriteria: "Blackbird played start to finish from memory.",
        status: "locked",
      },
    ],
    focusForWeek: "Drill the chord transitions that keep breaking the rhythm in bar 4.",
    summary:
      "Thumb independence is solid now. Transitions are the bottleneck — the rhythm breaks at the same two changes every time.",
    tasks: [
      { offset: 0, title: "Chord transition drills", description: "G to C to D, 60bpm, focus on clean landings.", startMinute: 540, minutes: 30, done: true, notes: "Cleaner. Still buzzing on the C." },
      { offset: 1, title: "Metronome chord changes", description: "Four bars each, no stopping between changes.", startMinute: 540, minutes: 30, done: false },
      { offset: 3, title: "Blackbird — section A", description: "First eight bars, slow and clean.", startMinute: 1080, minutes: 30, done: false },
      { offset: 4, title: "Fingerpicking pattern practice", description: "Travis picking over three shapes.", startMinute: 1080, minutes: 30, done: false },
      { offset: -7, title: "Alternating bass drill", description: "Thumb independence work.", startMinute: 540, minutes: 30, done: true },
      { offset: -5, title: "Chord shape review", description: "Open shapes, clean fretting.", startMinute: 540, minutes: 30, done: true },
      { offset: -12, title: "Thumb independence", description: "Bass line while holding melody.", startMinute: 540, minutes: 30, done: true },
    ],
  },
  {
    title: "Ship FocusFlow MVP",
    goal: "Launch a working MVP of my focus-tracking side project",
    progress: 22,
    clarifications: [
      { question: "What's the smallest useful version?", answer: "Timer, session history, and a weekly summary" },
      { question: "How much time per week?", answer: "Maybe 6 hours, mostly evenings" },
      { question: "When do you want it launched?", answer: "Within two months" },
    ],
    milestones: [
      {
        title: "Core timer and data model",
        description: "Build the session timer and decide how sessions are stored.",
        successCriteria: "Can start, stop, and persist a focus session.",
        status: "active",
      },
      {
        title: "Dashboard and weekly summary",
        description: "Visualise session history and weekly totals.",
        successCriteria: "Dashboard shows real session data over time.",
        status: "locked",
      },
      {
        title: "Auth, polish, and launch",
        description: "Add accounts, fix the rough edges, and deploy.",
        successCriteria: "Deployed and usable by someone who isn't me.",
        status: "locked",
      },
    ],
    focusForWeek: "Get the core timer persisting sessions end to end.",
    summary:
      "Scope is settled and the data model is sketched. Nothing is persisted yet, so that's the whole focus this week.",
    tasks: [
      { offset: 0, title: "Sketch the data model", description: "Sessions, tags, and how they relate.", startMinute: 840, minutes: 60, done: false },
      { offset: 2, title: "Build the timer UI", description: "Start, pause, reset. No persistence yet.", startMinute: 720, minutes: 90, done: false },
      { offset: 4, title: "Set up Next.js and auth", description: "Project scaffold and login flow.", startMinute: 630, minutes: 90, done: false },
      { offset: -6, title: "Competitor research", description: "What already exists and what's missing.", startMinute: 840, minutes: 60, done: true },
      { offset: -4, title: "Write the scope doc", description: "Decide what's in and out of the MVP.", startMinute: 840, minutes: 60, done: true },
    ],
  },
  {
    title: "Conversational Spanish",
    goal: "Hold a 15-minute conversation in Spanish without switching to English",
    progress: 15,
    clarifications: [
      { question: "What's your current level?", answer: "Two years in school, mostly forgotten" },
      { question: "How much time can you commit daily?", answer: "20 minutes, usually evenings" },
      { question: "Do you have anyone to practise with?", answer: "A colleague who's a native speaker" },
    ],
    milestones: [
      {
        title: "Rebuild core vocabulary",
        description: "Recover the everyday words and present-tense verbs.",
        successCriteria: "500 common words recalled reliably.",
        status: "active",
      },
      {
        title: "Past and future tenses",
        description: "Talk about things that already happened or haven't yet.",
        successCriteria: "Describe last weekend without stopping to translate.",
        status: "locked",
      },
      {
        title: "Sustained conversation",
        description: "Hold a real conversation at natural speed.",
        successCriteria: "15 minutes with a native speaker, no English.",
        status: "locked",
      },
    ],
    focusForWeek: "Present-tense verbs and daily vocabulary review.",
    summary:
      "Vocabulary is coming back faster than expected. Listening comprehension is lagging well behind reading.",
    tasks: [
      { offset: 0, title: "Vocabulary review: 20 new words", description: "Spaced repetition, food and travel.", startMinute: 1140, minutes: 20, done: true, notes: "Food vocabulary sticking well." },
      { offset: 1, title: "Grammar: present tense", description: "Regular -ar, -er, -ir conjugation drills.", startMinute: 1140, minutes: 25, done: false },
      { offset: 2, title: "Listening: slow podcast", description: "One episode, note unfamiliar words.", startMinute: 720, minutes: 25, done: false },
      { offset: 3, title: "Speaking drill", description: "Describe your day out loud for five minutes.", startMinute: 1020, minutes: 20, done: false },
      { offset: -7, title: "Vocabulary review", description: "Spaced repetition.", startMinute: 1140, minutes: 20, done: true },
      { offset: -3, title: "Listening practice", description: "Podcast episode.", startMinute: 720, minutes: 25, done: true },
    ],
  },
];

async function main() {
  // Cascades remove goals, milestones, tasks, snapshots, and availability.
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      password: await bcrypt.hash(DEMO_PASSWORD, 10),
      name: "Demo User",
    },
  });

  // Weekdays 09:00-17:00, plus Saturday morning.
  await prisma.availability.createMany({
    data: [
      ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({
        userId: user.id,
        dayOfWeek,
        startMinute: 540,
        endMinute: 1020,
      })),
      { userId: user.id, dayOfWeek: 6, startMinute: 540, endMinute: 720 },
    ],
  });

  let taskCount = 0;

  for (const seed of GOALS) {
    const goal = await prisma.goal.create({
      data: {
        title: seed.title,
        goal: seed.goal,
        userId: user.id,
        progress: seed.progress,
        clarifications: seed.clarifications,
        milestones: {
          create: seed.milestones.map((m, order) => ({
            title: m.title,
            description: m.description,
            successCriteria: m.successCriteria,
            order,
            targetWeekOffset: order * 4,
            status: m.status,
          })),
        },
      },
      include: { milestones: true },
    });

    const activeMilestone =
      goal.milestones.find((m) => m.status === "active") ?? goal.milestones[0];

    await prisma.task.createMany({
      data: seed.tasks.map((t, order) => {
        const date = day(t.offset);
        return {
          goalId: goal.id,
          milestoneId: activeMilestone.id,
          title: t.title,
          description: t.description,
          date,
          estimatedMinutes: t.minutes,
          scheduledStart: at(date, t.startMinute),
          scheduledEnd: at(date, t.startMinute + t.minutes),
          order,
          status: t.done ? "done" : "pending",
          notes: t.notes ?? null,
          completedAt: t.done ? at(date, t.startMinute + t.minutes) : null,
        };
      }),
    });
    taskCount += seed.tasks.length;

    // One snapshot per goal for the current week, plus the two prior weeks so
    // the history chart and streak have something to show.
    for (const weeksAgo of [0, 1, 2]) {
      const { weekNumber, year } = getWeekInfo(day(-7 * weeksAgo));
      await prisma.progressSnapshot.create({
        data: {
          goalId: goal.id,
          weekNumber,
          year,
          summary: weeksAgo === 0 ? seed.summary : "Steady progress through the week.",
          focusForWeek: weeksAgo === 0 ? seed.focusForWeek : "Keep the routine consistent.",
          currentMilestoneId: activeMilestone.id,
        },
      });
    }
  }

  console.log("Seeded the demo account:");
  console.log(`  Login   ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Goals   ${GOALS.length}`);
  console.log(`  Tasks   ${taskCount} across this week and the previous two`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
