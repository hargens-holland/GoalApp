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
    toast("Availability saved");
  }

  return (
    <div className="max-w-[680px]">
      <div className="text-[26px] font-bold tracking-[-0.02em]">Availability</div>
      <div className="mb-6 mt-[5px] max-w-[560px] text-[14.5px] leading-[1.5] text-ink-3">
        The Scheduler only places daily tasks inside the time windows you set here. Turn off a day to keep it free.
      </div>

      <div className="overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.06)] bg-card">
        {days.map((d) => (
          <div key={d.dayOfWeek} className="flex items-center gap-4 border-t border-[rgba(255,255,255,0.05)] px-5 py-[14px] first:border-t-0">
            <button
              onClick={() => patch(d.dayOfWeek, { on: !d.on })}
              className="relative h-6 w-[42px] flex-shrink-0 rounded-full transition-colors"
              style={{ background: d.on ? "#6d56f0" : "rgba(255,255,255,0.12)" }}
              aria-label={`Toggle ${d.name}`}
            >
              <span className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-[left]" style={{ left: d.on ? 21 : 3 }} />
            </button>
            <span className="w-[96px] flex-shrink-0 text-[14.5px] font-semibold" style={{ color: d.on ? "#f4f4f5" : "#71717a" }}>{d.name}</span>
            <div className="flex flex-1 items-center gap-[10px]" style={{ opacity: d.on ? 1 : 0.4 }}>
              <select
                value={d.start}
                disabled={!d.on}
                onChange={(e) => patch(d.dayOfWeek, { start: Number(e.target.value) })}
                className="cursor-pointer rounded-[9px] border border-[rgba(255,255,255,0.1)] bg-task-card px-[10px] py-[7px] font-mono text-[13px] font-medium text-ink"
              >
                {TIME_OPTIONS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
              </select>
              <span className="text-[13px] text-ink-4">to</span>
              <select
                value={d.end}
                disabled={!d.on}
                onChange={(e) => patch(d.dayOfWeek, { end: Number(e.target.value) })}
                className="cursor-pointer rounded-[9px] border border-[rgba(255,255,255,0.1)] bg-task-card px-[10px] py-[7px] font-mono text-[13px] font-medium text-ink"
              >
                {TIME_OPTIONS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
              </select>
              <span className="ml-auto text-[12px] font-medium" style={{ color: d.on ? "#52525b" : "#71717a" }}>{d.on ? "" : "Day off"}</span>
            </div>
          </div>
        ))}
      </div>

      <button onClick={save} disabled={saving || loading} className="mt-5 rounded-[11px] bg-primary px-[22px] py-[11px] text-[14px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-40">
        {saving ? "Saving…" : "Save availability"}
      </button>
    </div>
  );
}
