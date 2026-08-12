import { callClaude, parseJson, Clarification } from "./shared";

/**
 * ARCHITECT AGENT
 * Job: turn a goal into a durable roadmap of milestones. Runs rarely — at goal
 * creation or an explicit re-plan. It does NOT produce day-to-day tasks; that's
 * the Scheduler's job. Output is the stable structure everything else hangs off.
 */

export interface GeneratedMilestone {
  title: string;
  description: string;
  successCriteria: string;
  order: number;
  targetWeekOffset: number; // weeks from goal start
}

export interface Roadmap {
  milestones: GeneratedMilestone[];
}

function mockRoadmap(goal: string): Roadmap {
  const label = goal.slice(0, 40);
  return {
    milestones: [
      {
        title: `Foundations for: ${label}`,
        description:
          "Establish a baseline, gather what you need, and remove obvious blockers.",
        successCriteria: "You can name your starting point and have what you need to begin.",
        order: 0,
        targetWeekOffset: 0,
      },
      {
        title: "Build momentum",
        description: "Put in consistent reps on the core activity for this goal.",
        successCriteria: "Four consistent weeks of deliberate effort logged.",
        order: 1,
        targetWeekOffset: 2,
      },
      {
        title: "Push past the plateau",
        description: "Increase difficulty and address the gaps the Progress agent surfaces.",
        successCriteria: "A measurable improvement over your baseline.",
        order: 2,
        targetWeekOffset: 6,
      },
      {
        title: "Consolidate & finish",
        description: "Lock in the gains and reach the target outcome.",
        successCriteria: "Goal outcome achieved and sustainable.",
        order: 3,
        targetWeekOffset: 10,
      },
    ],
  };
}

export async function generateClarifyingQuestions(
  goal: string
): Promise<string[]> {
  const text = await callClaude(
    `A user wants to achieve: "${goal}"\n\nGenerate exactly 3 concise clarifying questions to personalize their roadmap. Return a JSON array of strings only, no markdown. Example: ["Question 1?", "Question 2?", "Question 3?"]`,
    512
  );
  if (!text) {
    return [
      "What is your current experience level with this goal?",
      "How many hours per week can you realistically dedicate to this?",
      "By when do you want to achieve this goal?",
    ];
  }
  return parseJson<string[]>(text, []);
}

export async function generateRoadmap(
  goal: string,
  clarifications: Clarification[]
): Promise<Roadmap> {
  const context = clarifications
    .map((c) => `Q: ${c.question}\nA: ${c.answer}`)
    .join("\n\n");

  const text = await callClaude(
    `You are a goal-planning architect. Break this goal into a roadmap of 3-6 sequential milestones (phases), not day-to-day tasks.\n\nGoal: "${goal}"\n\nContext:\n${context}\n\nEach milestone needs a title, a short description, a concrete success criteria, an order (0-based), and a targetWeekOffset (whole weeks from the start). Return raw JSON only, no markdown:\n{"milestones":[{"title":"...","description":"...","successCriteria":"...","order":0,"targetWeekOffset":0}]}`,
    1024
  );
  if (!text) return mockRoadmap(goal);
  const parsed = parseJson<Roadmap>(text, mockRoadmap(goal));
  return parsed.milestones?.length ? parsed : mockRoadmap(goal);
}

export async function adjustRoadmap(
  goal: string,
  milestones: Array<{ title: string; description: string; order: number }>,
  request: string
): Promise<Roadmap> {
  const current = milestones
    .map((m) => `${m.order}. ${m.title}: ${m.description}`)
    .join("\n");

  const text = await callClaude(
    `You are a goal-planning architect. Revise this milestone roadmap based on the user's request. Keep it to 3-6 sequential milestones.\n\nGoal: "${goal}"\n\nCurrent roadmap:\n${current}\n\nUser request: "${request}"\n\nReturn raw JSON only:\n{"milestones":[{"title":"...","description":"...","successCriteria":"...","order":0,"targetWeekOffset":0}]}`,
    1024
  );
  if (!text) {
    return {
      milestones: milestones.map((m) => ({
        title: m.title,
        description: `${m.description} [Adjusted: ${request}]`,
        successCriteria: "",
        order: m.order,
        targetWeekOffset: m.order * 2,
      })),
    };
  }
  const parsed = parseJson<Roadmap>(text, { milestones: [] });
  return parsed.milestones?.length
    ? parsed
    : {
        milestones: milestones.map((m) => ({
          title: m.title,
          description: m.description,
          successCriteria: "",
          order: m.order,
          targetWeekOffset: m.order * 2,
        })),
      };
}
