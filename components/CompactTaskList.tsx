"use client";

import { useState } from "react";

export interface CompactTask {
  id: string;
  title: string;
  time: string;
  completed: boolean;
  color: string;
}

function Row({ task }: { task: CompactTask }) {
  const [completed, setCompleted] = useState(task.completed);
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
    <div className="flex items-center gap-[11px] border-t border-[rgba(255,255,255,0.05)] px-[18px] py-[10px]">
      <button
        onClick={toggle}
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[6px] border-[1.5px] text-[10px] font-bold text-white"
        style={{ borderColor: completed ? task.color : "rgba(255,255,255,0.22)", background: completed ? task.color : "transparent" }}
      >
        {completed ? "✓" : ""}
      </button>
      <span className="w-[38px] flex-shrink-0 font-mono text-[12px] font-medium text-ink-3">{task.time}</span>
      <span
        className="flex-1 text-[13.5px] font-medium"
        style={{ color: completed ? "#6b6b73" : "#f4f4f5", textDecoration: completed ? "line-through" : "none" }}
      >
        {task.title}
      </span>
    </div>
  );
}

export default function CompactTaskList({ tasks }: { tasks: CompactTask[] }) {
  if (!tasks.length) {
    return <div className="border-t border-[rgba(255,255,255,0.05)] px-[18px] py-6 text-center text-[12.5px] text-ink-3">No tasks this week.</div>;
  }
  return <>{tasks.map((t) => <Row key={t.id} task={t} />)}</>;
}
