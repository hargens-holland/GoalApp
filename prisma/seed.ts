import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** YYYY-MM-DD (UTC) for today + offsetDays, as a Date at UTC midnight. */
function dayOffset(offset: number): Date {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

function getWeekInfo(date: Date = new Date()) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((d.valueOf() - yearStart.valueOf()) / 86400000 + 1) / 7
  );
  return { weekNumber, year: d.getUTCFullYear() };
}

async function main() {
  const { weekNumber, year } = getWeekInfo();

  // Clean up existing demo data (cascades handle children).
  await prisma.user.deleteMany({ where: { email: "demo@example.com" } });

  const hashedPassword = await bcrypt.hash("demo123", 10);
  const user = await prisma.user.create({
    data: { email: "demo@example.com", password: hashedPassword, name: "Demo User" },
  });

  // Availability: weekdays 9-17 (minutes from midnight), Saturday morning 9-12.
  await prisma.availability.createMany({
    data: [
      ...[1, 2, 3, 4, 5].map((dow) => ({
        userId: user.id,
        dayOfWeek: dow,
        startMinute: 540,
        endMinute: 1020,
      })),
      { userId: user.id, dayOfWeek: 6, startMinute: 540, endMinute: 720 },
    ],
  });

  // Goal + roadmap (Architect output).
  const goal = await prisma.goal.create({
    data: {
      title: "Get Stronger in the Gym",
      goal: "Build muscle and increase overall strength over 12 weeks",
      userId: user.id,
      progress: 15,
      clarifications: [
        { question: "What is your current experience level?", answer: "Intermediate, lifting 2 years" },
        { question: "How many days per week can you train?", answer: "4 days" },
        { question: "By when do you want to achieve this?", answer: "12 weeks" },
      ],
      milestones: {
        create: [
          {
            title: "Establish baseline & program",
            description: "Set starting weights and lock in a 4-day split.",
            successCriteria: "Baseline 1RMs recorded for the big lifts.",
            order: 0,
            targetWeekOffset: 0,
            status: "active",
          },
          {
            title: "Progressive overload block",
            description: "Add weight or reps each week on the main lifts.",
            successCriteria: "5% increase on bench, squat, deadlift.",
            order: 1,
            targetWeekOffset: 4,
            status: "locked",
          },
          {
            title: "Hypertrophy & accessories",
            description: "Add volume to lagging muscle groups.",
            successCriteria: "Visible size gain; accessories dialed in.",
            order: 2,
            targetWeekOffset: 8,
            status: "locked",
          },
        ],
      },
    },
    include: { milestones: true },
  });

  const activeMilestone = goal.milestones.find((m) => m.status === "active")!;

  // Dated daily tasks for this week (Scheduler output).
  const taskSeed = [
    { d: 0, title: "Upper body strength session", desc: "Bench 4x5, OHP 3x8, pull-ups 3x8.", min: 60, done: true, notes: "Benched 185x4x5. Add 5lbs next time.", meta: { weight: 185, reps: 5 } },
    { d: 1, title: "Lower body strength session", desc: "Squat 4x5, RDL 3x8, leg press 3x12.", min: 60, done: true, notes: "Squatted 225. Form solid.", meta: { weight: 225, reps: 5 } },
    { d: 2, title: "Active recovery & mobility", desc: "30-min walk + 15 min stretching.", min: 45, done: false },
    { d: 3, title: "Pull day (back & biceps)", desc: "Deadlift 3x5, rows 4x6, curls 3x12.", min: 60, done: false },
    { d: 4, title: "Weekly progress check-in", desc: "Weigh in, photos, note PRs.", min: 30, done: false },
  ];

  for (let i = 0; i < taskSeed.length; i++) {
    const t = taskSeed[i];
    await prisma.task.create({
      data: {
        goalId: goal.id,
        milestoneId: activeMilestone.id,
        title: t.title,
        description: t.desc,
        date: dayOffset(t.d),
        estimatedMinutes: t.min,
        order: i,
        completed: t.done,
        status: t.done ? "done" : "pending",
        notes: t.notes ?? null,
        metadata: t.meta ?? undefined,
        completedAt: t.done ? new Date() : null,
      },
    });
  }

  // Progress agent's weekly assessment.
  await prisma.progressSnapshot.create({
    data: {
      goalId: goal.id,
      weekNumber,
      year,
      summary: "First week underway. Baseline weights established on bench and squat.",
      focusForWeek: "Hit all four training sessions and log every working set.",
      currentMilestoneId: activeMilestone.id,
    },
  });

  console.log("✅ Seeded database:");
  console.log("   User: demo@example.com / demo123");
  console.log(`   Goal: "${goal.title}" with ${goal.milestones.length} milestones`);
  console.log(`   Tasks: ${taskSeed.length} dated tasks this week (2 done)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
