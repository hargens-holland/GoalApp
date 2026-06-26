import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function getWeekInfo(date: Date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((d.valueOf() - yearStart.valueOf()) / 86400000) + 1) / 7);
  return { weekNumber, year: d.getUTCFullYear() };
}

async function main() {
  const { weekNumber, year } = getWeekInfo();

  // Clean up existing demo data
  await prisma.taskCompletion.deleteMany({});
  await prisma.weeklySnapshot.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.plan.deleteMany({});
  await prisma.user.deleteMany({ where: { email: "demo@example.com" } });

  const hashedPassword = await bcrypt.hash("demo123", 10);

  const user = await prisma.user.create({
    data: {
      email: "demo@example.com",
      password: hashedPassword,
      name: "Demo User",
    },
  });

  const plan = await prisma.plan.create({
    data: {
      title: "Get Stronger in the Gym",
      goal: "Build muscle and increase overall strength over 12 weeks",
      userId: user.id,
      clarifications: [
        { question: "What is your current experience level?", answer: "Intermediate, been lifting for 2 years" },
        { question: "How many days per week can you train?", answer: "4 days" },
        { question: "What specific outcome do you want this week?", answer: "Increase bench press by 5lbs" },
      ],
    },
  });

  const tasks = await Promise.all([
    prisma.task.create({
      data: {
        title: "Upper body strength session",
        description: "Bench press 4x5, Overhead press 3x8, Pull-ups 3x8. Focus on progressive overload.",
        planId: plan.id,
        weekNumber,
        year,
        order: 0,
      },
    }),
    prisma.task.create({
      data: {
        title: "Lower body strength session",
        description: "Squat 4x5, Romanian deadlift 3x8, Leg press 3x12. Log weights used.",
        planId: plan.id,
        weekNumber,
        year,
        order: 1,
      },
    }),
    prisma.task.create({
      data: {
        title: "Active recovery & mobility",
        description: "30-minute walk plus 15 minutes of stretching targeting hips and shoulders.",
        planId: plan.id,
        weekNumber,
        year,
        order: 2,
      },
    }),
    prisma.task.create({
      data: {
        title: "Pull day (back & biceps)",
        description: "Deadlift 3x5, Barbell rows 4x6, Dumbbell curls 3x12. Track PR attempts.",
        planId: plan.id,
        weekNumber,
        year,
        order: 3,
      },
    }),
    prisma.task.create({
      data: {
        title: "Protein & nutrition tracking",
        description: "Hit 160g protein daily. Log meals in your tracking app. Aim for a 300 calorie surplus.",
        planId: plan.id,
        weekNumber,
        year,
        order: 4,
      },
    }),
    prisma.task.create({
      data: {
        title: "Weekly progress check-in",
        description: "Weigh yourself (morning, after bathroom). Take progress photos. Note any PRs hit this week.",
        planId: plan.id,
        weekNumber,
        year,
        order: 5,
      },
    }),
  ]);

  const snapshot = await prisma.weeklySnapshot.create({
    data: {
      planId: plan.id,
      weekNumber,
      year,
      summary: "First week of the program. Focus on establishing baseline weights.",
    },
  });

  // Mark first two tasks as completed for demo
  await prisma.taskCompletion.create({
    data: {
      taskId: tasks[0].id,
      weeklySnapshotId: snapshot.id,
      completed: true,
      notes: "Benched 185lbs for 4x5. Felt strong. Add 5lbs next week.",
      completedAt: new Date(),
      metadata: { weight: 185, reps: 5, sets: 4 },
    },
  });

  await prisma.taskCompletion.create({
    data: {
      taskId: tasks[1].id,
      weeklySnapshotId: snapshot.id,
      completed: true,
      notes: "Squatted 225lbs. Form felt good.",
      completedAt: new Date(),
      metadata: { weight: 225, reps: 5, sets: 4 },
    },
  });

  console.log(`✅ Seeded database:`);
  console.log(`   User: demo@example.com / demo123`);
  console.log(`   Plan: "${plan.title}"`);
  console.log(`   Tasks: ${tasks.length} tasks for week ${weekNumber}/${year}`);
  console.log(`   Completions: 2 tasks marked complete`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
