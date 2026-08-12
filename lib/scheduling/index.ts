import { prisma } from "@/lib/prisma";
import { eachDate } from "@/lib/agents/shared";

/**
 * SCHEDULING ABSTRACTION (in-app now, Google Calendar later)
 *
 * Everything that needs to know "when is the user free" goes through
 * getAvailability(). Today it reads the in-app Availability model. Later a
 * googleCalendar implementation can return the same DayAvailability[] shape from
 * the user's real calendar with zero changes to callers (the Scheduler agent
 * and the week view).
 */

export interface Block {
  startMinute: number; // minutes from midnight
  endMinute: number;
}

export interface DayAvailability {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Sunday
  blocks: Block[];
  availableMinutes: number;
}

// Used when a user hasn't configured availability yet: weekdays 9-17.
const DEFAULT_WEEKDAY: Block = { startMinute: 540, endMinute: 1020 };

function dowFromISO(isoDate: string): number {
  // Treat the date as UTC midnight to avoid TZ drift.
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export async function getAvailability(
  userId: string,
  start: Date,
  end: Date
): Promise<DayAvailability[]> {
  const rows = await prisma.availability.findMany({ where: { userId } });

  // Group configured windows by weekday.
  const byDow = new Map<number, Block[]>();
  for (const r of rows) {
    const list = byDow.get(r.dayOfWeek) || [];
    list.push({ startMinute: r.startMinute, endMinute: r.endMinute });
    byDow.set(r.dayOfWeek, list);
  }
  const hasConfig = rows.length > 0;

  return eachDate(start, end).map((date) => {
    const dow = dowFromISO(date);
    let blocks = byDow.get(dow) || [];
    if (!hasConfig) {
      // No config at all → assume a standard work week.
      blocks = dow >= 1 && dow <= 5 ? [DEFAULT_WEEKDAY] : [];
    }
    blocks = [...blocks].sort((a, b) => a.startMinute - b.startMinute);
    const availableMinutes = blocks.reduce(
      (sum, b) => sum + Math.max(0, b.endMinute - b.startMinute),
      0
    );
    return { date, dayOfWeek: dow, blocks, availableMinutes };
  });
}

export interface PlaceableTask {
  id: string;
  date: string; // YYYY-MM-DD
  estimatedMinutes: number | null;
}

export interface PlacedTask extends PlaceableTask {
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
}

function minutesToDate(isoDate: string, minute: number): Date {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return new Date(
    `${isoDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`
  );
}

/**
 * Pack dated tasks into the open blocks for their day, in order, giving each a
 * concrete scheduledStart/scheduledEnd. Tasks that don't fit are left unplaced
 * (null times) so the caller can flag an overloaded day.
 */
export function placeTasks(
  tasks: PlaceableTask[],
  availability: DayAvailability[]
): PlacedTask[] {
  const availByDate = new Map(availability.map((a) => [a.date, a]));
  const byDate = new Map<string, PlaceableTask[]>();
  for (const t of tasks) {
    const list = byDate.get(t.date) || [];
    list.push(t);
    byDate.set(t.date, list);
  }

  const placed: PlacedTask[] = [];
  for (const [date, dayTasks] of Array.from(byDate.entries())) {
    const day = availByDate.get(date);
    // Mutable cursor through the day's blocks.
    const blocks = day ? day.blocks.map((b) => ({ ...b })) : [];
    let bi = 0;
    let cursor = blocks[0]?.startMinute ?? 0;

    for (const t of dayTasks) {
      const dur = t.estimatedMinutes ?? 30;
      // Advance to a block that can fit the task.
      while (bi < blocks.length && cursor + dur > blocks[bi].endMinute) {
        bi++;
        cursor = blocks[bi]?.startMinute ?? Infinity;
      }
      if (bi < blocks.length && cursor + dur <= blocks[bi].endMinute) {
        placed.push({
          ...t,
          scheduledStart: minutesToDate(date, cursor),
          scheduledEnd: minutesToDate(date, cursor + dur),
        });
        cursor += dur;
      } else {
        placed.push({ ...t, scheduledStart: null, scheduledEnd: null });
      }
    }
  }
  return placed;
}
