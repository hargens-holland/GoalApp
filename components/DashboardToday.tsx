"use client";

import { useState } from "react";
import { useToast } from "./Toast";

export interface TodayTask {
  id: string;
  title: string;
  desc: string;
  time: string;
  completed: boolean;
  notes: string;
  goalTitle: string;
  color: string;
}

function Row({ task }: { task: TodayTask }) {
  const toast = useToast();
  const [completed, setCompleted] = useState(task.completed);
  const [notes, setNotes] = useState(task.notes);
  const [open, setOpen] = useState(false);

  async function toggle() {
    const next = !completed;
    setCompleted(next);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: next }),
    });
  }

  async function saveNote() {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    toast("Note saved");
  }

  return (
    <div className="border-t border-[rgba(255,255,255,0.05)]">
      <div className="flex items-start gap-[13px] px-5 py-[13px] transition-colors hover:bg-[rgba(255,255,255,0.018)]">
        <button
          onClick={toggle}
          className="mt-px flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[7px] border-[1.5px] text-[11px] font-bold text-white"
          style={{
            borderColor: completed ? task.color : "rgba(255,255,255,0.22)",
            background: completed ? task.color : "transparent",
          }}
        >
          {completed ? "✓" : ""}
        </button>
        <div className="w-[44px] flex-shrink-0 pt-0.5 font-mono text-[13px] font-medium text-ink-2">{task.time}</div>
        <div className="min-w-0 flex-1">
          <div
            className="text-[15px] font-medium"
            style={{ color: completed ? "#6b6b73" : "#f4f4f5", textDecoration: completed ? "line-through" : "none" }}
          >
            {task.title}
          </div>
          {task.desc && <div className="mt-0.5 text-[13px] text-ink-3">{task.desc}</div>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-[10px] pt-px">
          <span className="inline-flex items-center gap-[6px] text-[12px] font-medium text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: task.color }} />
            {task.goalTitle}
          </span>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-[rgba(255,255,255,0.08)] transition-colors hover:border-[rgba(255,255,255,0.16)] hover:text-[#d4d4d8]"
            style={{ color: notes ? task.color : "#71717a" }}
            aria-label="Toggle note"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
              <line x1="5" y1="6.2" x2="11" y2="6.2" strokeLinecap="round" />
              <line x1="5" y1="9" x2="9" y2="9" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="px-5 pb-[14px] pl-[80px]">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNote}
            placeholder="Add a note for this task…"
            className="min-h-[62px] w-full resize-y rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-field px-3 py-[10px] text-[13px] text-[#e4e4e7] outline-none focus:border-primary"
          />
        </div>
      )}
    </div>
  );
}

export default function DashboardToday({ tasks, dateLabel }: { tasks: TodayTask[]; dateLabel: string }) {
  const done = tasks.filter((t) => t.completed).length;
  return (
    <div className="overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.06)] bg-card">
      <div className="flex items-center justify-between px-5 pb-[14px] pt-[18px]">
        <div>
          <div className="text-[17px] font-bold tracking-[-0.01em]">Today</div>
          <div className="mt-px text-[12.5px] text-ink-3">{dateLabel}</div>
        </div>
        <span className="rounded-full bg-[rgba(255,255,255,0.05)] px-[11px] py-[5px] font-mono text-[12.5px] font-semibold text-ink-2">
          {done} / {tasks.length} done
        </span>
      </div>
      {tasks.length === 0 ? (
        <div className="border-t border-[rgba(255,255,255,0.05)] px-5 py-10 text-center text-[13.5px] text-ink-3">
          Nothing scheduled today.
        </div>
      ) : (
        tasks.map((t) => <Row key={t.id} task={t} />)
      )}
    </div>
  );
}
