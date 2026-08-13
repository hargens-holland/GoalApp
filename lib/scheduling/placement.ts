import type { DayAvailability } from "./availability";

/**
 * TIME-OF-DAY PLACEMENT
 *
 * Packs dated tasks into the free blocks of their day, giving each a concrete
 * start and end time. This is deliberately deterministic arithmetic rather than
 * something the Scheduler agent decides: "does a 45-minute task fit in the gap
 * between 09:00 and 09:30" is exact, and a model should not be doing it.
 *
 * Pure and dependency-free, which makes it the most heavily tested unit in the
 * codebase (see __tests__/placement.test.ts).
 */

export interface PlaceableTask {
  /** Caller-supplied identifier, echoed back on the result so callers can
   *  re-associate placements with their original tasks. Placement groups tasks
   *  by day, so the output order does NOT match the input order. */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  estimatedMinutes: number | null;
}

export interface PlacedTask extends PlaceableTask {
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
}

/** Default duration for a task the scheduler gave no estimate for. */
const DEFAULT_TASK_MINUTES = 30;

function minutesToDate(isoDate: string, minute: number): Date {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return new Date(
    `${isoDate}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00Z`
  );
}

/**
 * Assign each task a start/end time inside its day's available blocks.
 *
 * Tasks are packed in the order given, filling each block before moving to the
 * next. A task that does not fit in any remaining block is returned with null
 * times — it stays scheduled for the day but un-slotted, so the UI can show it
 * without pretending there was room. Overflow is surfaced, never dropped.
 */
export function placeTasks(
  tasks: PlaceableTask[],
  availability: DayAvailability[]
): PlacedTask[] {
  const availabilityByDate = new Map(availability.map((a) => [a.date, a]));

  const tasksByDate = new Map<string, PlaceableTask[]>();
  for (const task of tasks) {
    const list = tasksByDate.get(task.date) ?? [];
    list.push(task);
    tasksByDate.set(task.date, list);
  }

  const placed: PlacedTask[] = [];
  for (const [date, dayTasks] of Array.from(tasksByDate.entries())) {
    const day = availabilityByDate.get(date);
    const blocks = day ? day.blocks.map((b) => ({ ...b })) : [];

    let blockIndex = 0;
    let cursor = blocks[0]?.startMinute ?? 0;

    for (const task of dayTasks) {
      const duration = task.estimatedMinutes ?? DEFAULT_TASK_MINUTES;

      // Advance past any block that cannot fit this task.
      while (blockIndex < blocks.length && cursor + duration > blocks[blockIndex].endMinute) {
        blockIndex++;
        cursor = blocks[blockIndex]?.startMinute ?? Infinity;
      }

      const fits =
        blockIndex < blocks.length && cursor + duration <= blocks[blockIndex].endMinute;

      if (fits) {
        placed.push({
          ...task,
          scheduledStart: minutesToDate(date, cursor),
          scheduledEnd: minutesToDate(date, cursor + duration),
        });
        cursor += duration;
      } else {
        placed.push({ ...task, scheduledStart: null, scheduledEnd: null });
      }
    }
  }
  return placed;
}
