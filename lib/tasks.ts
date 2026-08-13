/**
 * Task completion state.
 *
 * `Task.status` is the single stored representation of whether a task is done.
 * An earlier version also carried a `completed` boolean, which meant one fact
 * lived in two columns kept in sync by hand in the update handler — they could
 * disagree, and nothing would notice.
 *
 * The string wins because it is strictly more expressive: it can say "skipped",
 * which a boolean cannot. Clients still get a `completed` convenience flag, but
 * it is *derived* on the way out rather than stored, so there is exactly one
 * source of truth.
 */

export const TASK_STATUS = {
  pending: "pending",
  done: "done",
  skipped: "skipped",
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

/** Whether a status counts as completed work. */
export function isDone(status: string): boolean {
  return status === TASK_STATUS.done;
}

/**
 * Prisma filter for "not finished".
 *
 * Used by regeneration, which replaces only unfinished work. Note that a
 * *skipped* task is finished — the user made a decision about it — so it is
 * preserved rather than silently rescheduled.
 *
 * A function rather than a constant so each call gets a fresh, mutable array;
 * Prisma's generated filter types reject readonly arrays.
 */
export function notFinishedFilter(): { status: { notIn: string[] } } {
  return { status: { notIn: [TASK_STATUS.done, TASK_STATUS.skipped] } };
}

/**
 * Add the derived `completed` flag to a task before it crosses the API
 * boundary, so clients don't each re-implement the status comparison.
 */
export function serializeTask<T extends { status: string }>(
  task: T
): T & { completed: boolean } {
  return { ...task, completed: isDone(task.status) };
}

/** Same, for a goal carrying a nested `tasks` array. */
export function serializeGoalTasks<
  TTask extends { status: string },
  TGoal extends { tasks: TTask[] },
>(goal: TGoal): Omit<TGoal, "tasks"> & { tasks: (TTask & { completed: boolean })[] } {
  return { ...goal, tasks: goal.tasks.map(serializeTask) };
}

/** Field updates for setting a task's completion from a boolean. */
export function completionUpdate(completed: boolean): {
  status: TaskStatus;
  completedAt: Date | null;
} {
  return {
    status: completed ? TASK_STATUS.done : TASK_STATUS.pending,
    completedAt: completed ? new Date() : null,
  };
}
