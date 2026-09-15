"use client";

import { useState } from "react";
import { goalColor } from "@/lib/colors";

export interface CompactTask {
  id: string;
  title: string;
  /** "Mon 15" */
  day: string;
  time: string;
  completed: boolean;
}

function Row({ task, hue }: { task: CompactTask; hue: number }) {
  const [completed, setCompleted] = useState(task.completed);
  const color = goalColor(hue);
  async function toggle() {
    const next = !completed;
    setCompleted(next);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: next }),
    });
  }
  return (
    <div className="row flex items-center gap-3 py-[9px]">
      <button
        onClick={toggle}
        aria-label={completed ? "Mark not done" : "Mark done"}
        className="flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center rounded-sm border transition-colors"
        style={{ borderColor: completed ? color : "rgba(21,23,28,0.35)", background: completed ? color : "transparent" }}
      />
      <span className="w-[52px] flex-shrink-0 font-mono text-[12px] text-ink-3">{task.day}</span>
      <span className="w-[42px] flex-shrink-0 font-mono text-[12px] text-ink-4">{task.time || "—"}</span>
      <span className={`flex-1 truncate text-[14px] ${completed ? "text-ink-3 line-through" : "text-ink"}`}>{task.title}</span>
    </div>
  );
}

export default function CompactTaskList({ tasks, hue }: { tasks: CompactTask[]; hue: number }) {
  if (!tasks.length) {
    return <p className="py-4 text-[13.5px] text-ink-3">Nothing placed this week.</p>;
  }
  return <div className="border-t border-rule">{tasks.map((t) => <Row key={t.id} task={t} hue={hue} />)}</div>;
}
