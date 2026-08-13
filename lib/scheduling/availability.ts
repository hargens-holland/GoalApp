import { prisma } from "@/lib/prisma";
import { eachDate } from "@/lib/dates";

/**
 * AVAILABILITY
 *
 * Everything that needs to know "when is the user free" goes through
 * getAvailability(). Today it reads the in-app Availability model; a future
 * Google Calendar implementation can return the same DayAvailability[] shape
 * from a real calendar without any caller changing. That seam is the reason
 * availability is a module rather than an inline query.
 */

export interface Block {
  /** Minutes from midnight, UTC. 540 = 09:00. */
  startMinute: number;
  endMinute: number;
}

export interface DayAvailability {
  /** YYYY-MM-DD */
  date: string;
  /** 0 = Sunday */
  dayOfWeek: number;
  blocks: Block[];
  availableMinutes: number;
}

/** Assumed when a user has not configured availability at all: weekdays 9-5. */
const DEFAULT_WEEKDAY: Block = { startMinute: 540, endMinute: 1020 };

function dayOfWeekFromISO(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export async function getAvailability(
  userId: string,
  start: Date,
  end: Date
): Promise<DayAvailability[]> {
  const rows = await prisma.availability.findMany({ where: { userId } });

  const byDayOfWeek = new Map<number, Block[]>();
  for (const row of rows) {
    const list = byDayOfWeek.get(row.dayOfWeek) ?? [];
    list.push({ startMinute: row.startMinute, endMinute: row.endMinute });
    byDayOfWeek.set(row.dayOfWeek, list);
  }
  const hasConfiguredAvailability = rows.length > 0;

  return eachDate(start, end).map((date) => {
    const dayOfWeek = dayOfWeekFromISO(date);

    // A user who has configured availability and left a day empty means it:
    // that day is unavailable. Only a user with no configuration at all gets
    // the weekday default.
    let blocks = hasConfiguredAvailability
      ? (byDayOfWeek.get(dayOfWeek) ?? [])
      : dayOfWeek >= 1 && dayOfWeek <= 5
        ? [DEFAULT_WEEKDAY]
        : [];

    blocks = [...blocks].sort((a, b) => a.startMinute - b.startMinute);
    const availableMinutes = blocks.reduce(
      (sum, b) => sum + Math.max(0, b.endMinute - b.startMinute),
      0
    );
    return { date, dayOfWeek, blocks, availableMinutes };
  });
}
