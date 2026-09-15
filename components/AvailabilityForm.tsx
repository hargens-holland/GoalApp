"use client";

import { useEffect, useState } from "react";
import { useToast } from "./Toast";
import { minutesToHHMM } from "@/lib/format";

interface DayState {
  dayOfWeek: number; // 0=Sun..6=Sat
  name: string;
  on: boolean;
  start: number; // minutes from midnight
  end: number;
}

// Mon→Sun display order, mapped to data's 0=Sun indexing.
const ORDER: { dow: number; name: string }[] = [
  { dow: 1, name: "Monday" }, { dow: 2, name: "Tuesday" }, { dow: 3, name: "Wednesday" },
  { dow: 4, name: "Thursday" }, { dow: 5, name: "Friday" }, { dow: 6, name: "Saturday" }, { dow: 0, name: "Sunday" },
];

// 05:00–23:00 in 30-minute steps.
const TIME_OPTIONS: number[] = [];
for (let m = 300; m <= 1380; m += 30) TIME_OPTIONS.push(m);

function defaults(): DayState[] {
  return ORDER.map(({ dow, name }) => ({ dayOfWeek: dow, name, on: dow >= 1 && dow <= 5, start: 540, end: 1020 }));
}

export default function AvailabilityForm() {
  const toast = useToast();
  const [days, setDays] = useState<DayState[]>(defaults());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/availability");
      const rows: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }> = await res.json();
      if (rows.length) {
        setDays(ORDER.map(({ dow, name }) => {
          const row = rows.find((r) => r.dayOfWeek === dow);
          return row
            ? { dayOfWeek: dow, name, on: true, start: row.startMinute, end: row.endMinute }
            : { dayOfWeek: dow, name, on: false, start: 540, end: 1020 };
        }));
      }
      setLoading(false);
    })();
  }, []);

  function patch(dow: number, p: Partial<DayState>) {
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dow ? { ...d, ...p } : d)));
  }

  async function save() {
    setSaving(true);
    const windows = days
      .filter((d) => d.on && d.end > d.start)
      .map((d) => ({ dayOfWeek: d.dayOfWeek, startMinute: d.start, endMinute: d.end }));
    await fetch("/api/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windows }),
    });
    setSaving(false);
    toast("Saved. Replan the week to apply it.");
  }

  const totalHours = days.filter((d) => d.on).reduce((s, d) => s + Math.max(0, d.end - d.start), 0) / 60;

  const selectClass =
    "cursor-pointer rounded border border-rule-2 bg-surface px-2 py-[5px] font-mono text-[13px] text-ink disabled:cursor-default disabled:text-ink-4";

  return (
    <div className="mx-auto max-w-[640px]">
      <div className="eyebrow">Availability</div>
      <h1 className="display mt-1 text-[40px] leading-[1.05]">When are you free?</h1>
      <p className="mt-4 text-[15.5px] leading-[1.55] text-ink-2">
        Tasks are only ever placed inside these windows. A day that&apos;s off stays empty.
      </p>

      <div className="mt-8 border-t border-rule">
        {days.map((d) => (
          <div key={d.dayOfWeek} className="row flex items-center gap-4 py-[12px]">
            <button
              onClick={() => patch(d.dayOfWeek, { on: !d.on })}
              role="switch"
              aria-checked={d.on}
              aria-label={`Toggle ${d.name}`}
              className="relative h-[20px] w-[34px] flex-shrink-0 rounded-full transition-colors"
              style={{ background: d.on ? "#15171c" : "rgba(21,23,28,0.18)" }}
            >
              <span className="absolute top-[3px] h-[14px] w-[14px] rounded-full bg-paper transition-[left]" style={{ left: d.on ? 17 : 3 }} />
            </button>
            <span className={`w-[100px] flex-shrink-0 text-[15px] ${d.on ? "text-ink" : "text-ink-4"}`}>{d.name}</span>
            {loading ? (
              <div className="skeleton h-[28px] w-[170px]" />
            ) : d.on ? (
              <div className="flex items-center gap-2">
                <select value={d.start} onChange={(e) => patch(d.dayOfWeek, { start: Number(e.target.value) })} className={selectClass}>
                  {TIME_OPTIONS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
                </select>
                <span className="text-[13px] text-ink-4">to</span>
                <select value={d.end} onChange={(e) => patch(d.dayOfWeek, { end: Number(e.target.value) })} className={selectClass}>
                  {TIME_OPTIONS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
                </select>
                <span className="ml-3 font-mono text-[12px] text-ink-4">{((d.end - d.start) / 60).toFixed(1)}h</span>
              </div>
            ) : (
              <span className="text-[13.5px] text-ink-4">Off</span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <span className="text-[13.5px] text-ink-3">
          <span className="font-mono text-ink-2">{totalHours.toFixed(1)}</span> hours a week
        </span>
        <button onClick={save} disabled={saving || loading} className="btn">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
