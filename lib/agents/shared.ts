import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
export const client = apiKey ? new Anthropic({ apiKey }) : null;

export const MODEL = "claude-opus-4-8";

/** Parse JSON that may be wrapped in markdown code fences. */
export function parseJson<T>(text: string, fallback: T): T {
  try {
    const cleaned = text
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

/**
 * Single entry point for a one-shot Claude call. Returns the model's text, or
 * null when no API key is configured so each agent can fall back to a mock.
 */
export async function callClaude(
  prompt: string,
  maxTokens = 1024
): Promise<string | null> {
  if (!client) return null;
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const content = message.content[0];
  return content && content.type === "text" ? content.text : null;
}

export function getWeekInfo(date: Date = new Date()): {
  weekNumber: number;
  year: number;
} {
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

/** ISO date string (YYYY-MM-DD) for a Date, in UTC. */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Each calendar date (YYYY-MM-DD) inclusive between start and end. */
export function eachDate(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const d = new Date(
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  );
  const last = new Date(
    Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  );
  while (d <= last) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

export interface Clarification {
  question: string;
  answer: string;
}

/** Monday→Sunday UTC range containing `date`. */
export function getWeekRange(date: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7; // Sun=7
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - (dayNum - 1));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}
