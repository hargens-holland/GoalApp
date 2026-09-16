/**
 * Scheduling: turning a goal's current focus into dated, time-slotted tasks.
 *
 *   availability.ts   — when is the user free (swappable for a real calendar)
 *   placement.ts      — deterministic packing of tasks into free blocks
 *   run-scheduler.ts  — end-to-end orchestration, the one place a week is built
 */
export { getAvailability } from "./availability";
export type { Block, DayAvailability } from "./availability";

export { placeTasks, subtractBusy } from "./placement";
export type { BusyInterval, PlaceableTask, PlacedTask } from "./placement";

export { runScheduler } from "./run-scheduler";
export type { SchedulerRunResult } from "./run-scheduler";
