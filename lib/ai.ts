import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export interface GeneratedTask {
  title: string;
  description: string;
  order: number;
}

export interface GeneratedPlan {
  tasks: GeneratedTask[];
}

export function getWeekInfo(date: Date = new Date()): { weekNumber: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((d.valueOf() - yearStart.valueOf()) / 86400000) + 1) / 7);
  return { weekNumber, year: d.getUTCFullYear() };
}

function mockPlan(goal: string): GeneratedPlan {
  const label = goal.slice(0, 40);
  return {
    tasks: [
      { title: `Research & planning: ${label}`, description: "Spend 30 minutes researching your goal. Identify 3 key milestones and write them down.", order: 0 },
      { title: "Environment setup", description: "Prepare everything you need to work toward your goal — equipment, tools, schedule.", order: 1 },
      { title: "First concrete action", description: "Take the first tangible step. Do the thing, not just plan the thing.", order: 2 },
      { title: "Mid-week practice session", description: "Reinforce what you started. Deliberate repetition beats long one-off sessions.", order: 3 },
      { title: "Obstacle audit", description: "Identify what slowed you down this week. Write a one-sentence solution for each blocker.", order: 4 },
      { title: "Weekly review & plan next steps", description: "Reflect on what worked and what didn't. Note 3 things to carry into next week.", order: 5 },
    ],
  };
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

export async function generateClarifyingQuestions(goal: string): Promise<string[]> {
  if (!client) {
    return [
      "What is your current experience level with this goal?",
      "How many hours per week can you realistically dedicate to this?",
      "What specific result would make this week feel like a success?",
    ];
  }

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `A user wants to achieve: "${goal}"\n\nGenerate exactly 3 concise clarifying questions to personalize their weekly plan. Return a JSON array of strings only, no markdown. Example: ["Question 1?", "Question 2?", "Question 3?"]`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") return [];
  return parseJson<string[]>(content.text, []);
}

export async function generateInitialPlan(
  goal: string,
  clarifications: Array<{ question: string; answer: string }>
): Promise<GeneratedPlan> {
  if (!client) return mockPlan(goal);

  const clarificationText = clarifications
    .map((c) => `Q: ${c.question}\nA: ${c.answer}`)
    .join("\n\n");

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a goal planning expert. Create a structured weekly plan for someone with this goal: "${goal}"\n\nContext:\n${clarificationText}\n\nReturn a JSON object with this structure (no markdown, raw JSON only):\n{"tasks":[{"title":"Task title","description":"Specific actionable description","order":0}]}\n\nGenerate 5-7 specific, measurable tasks.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") return mockPlan(goal);
  return parseJson<GeneratedPlan>(content.text, mockPlan(goal));
}

export async function regeneratePlan(
  goal: string,
  lastWeek: {
    completedTasks: string[];
    incompleteTasks: string[];
    notes: string[];
  }
): Promise<GeneratedPlan> {
  if (!client) {
    const base = mockPlan(goal);
    return {
      tasks: base.tasks.map((t, i) => ({
        ...t,
        title: `[Week +1] ${t.title}`,
        order: i,
      })),
    };
  }

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Goal: "${goal}"\n\nLast week:\n- Completed: ${lastWeek.completedTasks.join(", ") || "none"}\n- Incomplete: ${lastWeek.incompleteTasks.join(", ") || "none"}\n- Notes: ${lastWeek.notes.join("; ") || "none"}\n\nGenerate a new weekly plan that builds on progress and addresses gaps. Return raw JSON only:\n{"tasks":[{"title":"...","description":"...","order":0}]}\n\n5-7 tasks.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") return mockPlan(goal);
  return parseJson<GeneratedPlan>(content.text, mockPlan(goal));
}

export async function adjustPlan(
  goal: string,
  currentTasks: Array<{ title: string; description: string }>,
  adjustment: string
): Promise<GeneratedPlan> {
  if (!client) {
    return {
      tasks: currentTasks.map((t, i) => ({
        title: t.title,
        description: `${t.description} [Adjusted: ${adjustment}]`,
        order: i,
      })),
    };
  }

  const taskList = currentTasks
    .map((t, i) => `${i + 1}. ${t.title}: ${t.description}`)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Goal: "${goal}"\n\nCurrent tasks:\n${taskList}\n\nUser request: "${adjustment}"\n\nModify the plan accordingly. Return raw JSON only:\n{"tasks":[{"title":"...","description":"...","order":0}]}`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") return mockPlan(goal);
  return parseJson<GeneratedPlan>(content.text, mockPlan(goal));
}
