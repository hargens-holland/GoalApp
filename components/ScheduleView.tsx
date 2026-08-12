"use client";

import { useCallback, useEffect, useState } from "react";
import { goalColor } from "@/lib/colors";
import { timeFromISO, weekRangeLabel, shortDow } from "@/lib/format";

interface SchedTask {
  id: string;
  title: string;
  date: string;
  scheduledStart: string | null;
  completed: boolean;
  goal: { id: string; title: string };
}

export default function ScheduleView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [tasks, setTasks] = useState<SchedTask[]>([]);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/schedule?weekOffset=${weekOffset}`);
    const data = await res.json();
    setTasks(data.tasks ?? []);
    setRange({ start: data.start, end: data.end });
    setLoading(false);
  }, [weekOffset]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(t: SchedTask) {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed: !x.completed } : x)));
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !t.completed }),
    });
  }

  async function regenerate() {
    setRegenerating(true);
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekOffset }),
    });
    await load();
    setRegenerating(false);
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const days: { iso: string; dow: number; num: number; isToday: boolean }[] = [];
  if (range) {
    const start = new Date(range.start);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      days.push({ iso, dow: d.getUTCDay(), num: d.getUTCDate(), isToday: iso === todayISO });
    }
  }

  const legend = Array.from(new Map(tasks.map((t) => [t.goal.id, t.goal.title])));

  return (
    <div>
      <div className="mb-[18px] flex items-end justify-between gap-4">
        <div>
          <div className="text-[26px] font-bold tracking-[-0.02em]">Calendar</div>
          <div className="mt-1 font-mono text-[14px] text-ink-2">{range ? weekRangeLabel(range.start, range.end) : "…"}</div>
        </div>
        <div className="flex items-center gap-[9px]">
          <div className="flex items-center overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-card">
            <button onClick={() => setWeekOffset((w) => w - 1)} className="flex px-3 py-[9px] text-[#d4d4d8] transition-colors hover:bg-[rgba(255,255,255,0.05)]" aria-label="Previous week">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 4 L6 8 L10 12" /></svg>
            </button>
            <button onClick={() => setWeekOffset(0)} className="border-x border-[rgba(255,255,255,0.08)] px-[14px] py-[9px] text-[13px] font-medium text-[#d4d4d8] transition-colors hover:bg-[rgba(255,255,255,0.05)]">Today</button>
            <button onClick={() => setWeekOffset((w) => w + 1)} className="flex px-3 py-[9px] text-[#d4d4d8] transition-colors hover:bg-[rgba(255,255,255,0.05)]" aria-label="Next week">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4 L10 8 L6 12" /></svg>
            </button>
          </div>
          <button onClick={regenerate} disabled={regenerating} className="btn-primary">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M13 8 a5 5 0 1 1 -1.6 -3.7" /><path d="M13 2 V5 H10" /></svg>
            {regenerating ? "Scheduling…" : "Regenerate week"}
          </button>
        </div>
      </div>

      {legend.length > 0 && (
        <div className="mb-[18px] flex flex-wrap gap-[14px]">
          {legend.map(([id, title]) => (
            <span key={id} className="inline-flex items-center gap-[7px] text-[12.5px] font-medium text-ink-2">
              <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: goalColor(id) }} />
              {title}
            </span>
          ))}
        </div>
      )}

      {!loading && tasks.length === 0 && (
        <div className="mb-[14px] rounded-[14px] border border-dashed border-[rgba(255,255,255,0.1)] bg-card px-5 py-4 text-[13.5px] text-ink-3">
          No tasks scheduled for this week yet. Hit <span className="text-[#a899ff]">Regenerate week</span> to let the Scheduler plan it.
        </div>
      )}

      <div className="grid grid-cols-7 gap-[10px]">
        {days.map((day) => {
          const dayTasks = tasks
            .filter((t) => t.date.slice(0, 10) === day.iso)
            .sort((a, b) => (a.scheduledStart ?? "z").localeCompare(b.scheduledStart ?? "z"));
          return (
            <div
              key={day.iso}
              className="min-h-[430px] rounded-[14px] border bg-card-2 p-[9px]"
              style={{ minWidth: 0, borderColor: day.isToday ? "rgba(109,86,240,0.3)" : "rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center justify-between px-[5px] pb-[9px] pt-[3px]">
                <span className="text-[12px] font-semibold" style={{ color: day.isToday ? "#f4f4f5" : "#71717a" }}>{shortDow(day.dow)}</span>
                <span
                  className="rounded-[7px] px-[7px] py-px font-mono text-[13px] font-semibold"
                  style={{ color: day.isToday ? "#f4f4f5" : "#71717a", background: day.isToday ? "rgba(109,86,240,0.18)" : "transparent" }}
                >
                  {day.num}
                </span>
              </div>
              {dayTasks.map((t) => {
                const color = goalColor(t.goal.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t)}
                    className="mb-[7px] block w-full rounded-[9px] border border-[rgba(255,255,255,0.06)] bg-task-card p-[7px_9px] text-left transition-colors hover:bg-elevated"
                    style={{ borderLeft: `3px solid ${color}` }}
                  >
                    {timeFromISO(t.scheduledStart) && (
                      <div className="font-mono text-[11px] font-medium" style={{ color }}>{timeFromISO(t.scheduledStart)}</div>
                    )}
                    <div
                      className="mt-px text-[12.5px] font-medium leading-[1.25]"
                      style={{ color: t.completed ? "#6b6b73" : "#f4f4f5", textDecoration: t.completed ? "line-through" : "none" }}
                    >
                      {t.title}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
