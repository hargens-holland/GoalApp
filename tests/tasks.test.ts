import { describe, it, expect } from "vitest";
import {
  completionUpdate,
  isDone,
  notFinishedFilter,
  serializeGoalTasks,
  serializeTask,
  TASK_STATUS,
} from "@/lib/tasks";

/**
 * `Task.status` is the single stored representation of completion. These tests
 * pin the derivation rules, because the bug this module exists to prevent — a
 * stored boolean drifting out of sync with the status string — is silent when
 * it happens.
 */

describe("isDone", () => {
  it("treats only 'done' as completed", () => {
    expect(isDone(TASK_STATUS.done)).toBe(true);
    expect(isDone(TASK_STATUS.pending)).toBe(false);
  });

  it("does not treat a skipped task as completed", () => {
    // Skipped means the user decided not to do it — finished, but not done.
    expect(isDone(TASK_STATUS.skipped)).toBe(false);
  });
});

describe("notFinishedFilter", () => {
  it("excludes both done and skipped work from regeneration", () => {
    // Regeneration deletes what this matches. A skipped task must survive:
    // the user already made a decision, and silently rescheduling it would
    // undo that decision.
    expect(notFinishedFilter().status.notIn).toEqual(["done", "skipped"]);
  });

  it("returns a fresh mutable array each call", () => {
    // Prisma's generated filter types reject readonly arrays, and sharing one
    // array between queries would let a caller mutate the shared constant.
    const a = notFinishedFilter();
    const b = notFinishedFilter();
    expect(a.status.notIn).not.toBe(b.status.notIn);
  });
});

describe("completionUpdate", () => {
  it("sets status and a completion timestamp when marking done", () => {
    const update = completionUpdate(true);
    expect(update.status).toBe("done");
    expect(update.completedAt).toBeInstanceOf(Date);
  });

  it("clears the timestamp when un-completing", () => {
    const update = completionUpdate(false);
    expect(update.status).toBe("pending");
    expect(update.completedAt).toBeNull();
  });
});

describe("serializeTask", () => {
  it("adds a derived completed flag without altering status", () => {
    const row = { id: "t1", title: "Easy 5K", status: "done" };
    expect(serializeTask(row)).toEqual({
      id: "t1",
      title: "Easy 5K",
      status: "done",
      completed: true,
    });
  });

  it("reports a skipped task as not completed", () => {
    expect(serializeTask({ status: "skipped" }).completed).toBe(false);
  });

  it("does not mutate the input row", () => {
    const row = { status: "pending" };
    serializeTask(row);
    expect(row).toEqual({ status: "pending" });
  });
});

describe("serializeGoalTasks", () => {
  it("derives the flag for every nested task", () => {
    const goal = {
      id: "g1",
      tasks: [{ status: "done" }, { status: "pending" }, { status: "skipped" }],
    };
    expect(serializeGoalTasks(goal).tasks.map((t) => t.completed)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("handles a goal with no tasks", () => {
    expect(serializeGoalTasks({ tasks: [] }).tasks).toEqual([]);
  });
});
