"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { goalColor, goalInk, goalSoft } from "@/lib/colors";
import { dateLabel, minutesToHHMM, timeFromISO, weekRangeLabel } from "@/lib/format";
import { useToast } from "./Toast";
import { LIMITS } from "@/lib/validation";

/**
 * THE WEEK
 *
 * The product's one idea is that goals get placed into the hours you are
 * actually free, so the week is the first thing you see, drawn to scale: each
 * day is a time axis, the user's free windows are shaded behind it, and every
 * task sits inside one of those windows at its real time and duration.
 *
 * The same view serves as the calendar (previous / next week) and as the
 * place to tick things off. Below the grid, today's tasks are listed with room
 * for notes — the notes are what the Progress agent reads at the weekly review.
 */

export interface WeekTask {
  id: string;
  title: string;
  description: string | null;
  /** ISO datetime, UTC midnight of the task's day. */
  date: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  estimatedMinutes: number | null;
  completed: boolean;
  notes: string | null;
  goal: { id: string; title: string; hue: number };
}

export interface DayAvailability {
  /** YYYY-MM-DD */
  date: string;
  dayOfWeek: number;
  blocks: { startMinute: number; endMinute: number }[];
  availableMinutes: number;
}

export interface WeekData {
  start: string;
  end: string;
  tasks: WeekTask[];
  availability: DayAvailability[];
}

export interface GoalSummary {
  id: string;
  title: string;
  hue: number;
  progress: number;
  activeMilestone: string | null;
}

interface Props {
  initial: WeekData;
  goals: GoalSummary[];
  /** Trailing weeks, before this one, with at least half the tasks done. */
  streak: number;
  /** YYYY-MM-DD, UTC. */
  todayISO: string;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Vertical scale of the grid. 5 hours of availability ≈ 375px; a 30-minute
 *  task is tall enough for its time and a full-width title line. */
const PX_PER_MINUTE = 1.25;
/** Shortest block that still fits a line of text. */
const MIN_BLOCK_PX = 24;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function minuteOfDay(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * The hour range the grid spans: the user's earliest window start to latest
 * window end this week, snapped outward to the hour. Tasks are included too, so
 * a task that somehow sits outside every window is shown rather than hidden —
 * a constraint violation should be visible, not clipped.
 */
function axisRange(availability: DayAvailability[], tasks: WeekTask[]) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const day of availability) {
    for (const b of day.blocks) {
      lo = Math.min(lo, b.startMinute);
      hi = Math.max(hi, b.endMinute);
    }
  }
  for (const t of tasks) {
    const s = minuteOfDay(t.scheduledStart);
    const e = minuteOfDay(t.scheduledEnd);
    if (s != null) lo = Math.min(lo, s);
    if (e != null) hi = Math.max(hi, e);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 9 * 60;
    hi = 17 * 60;
  }
  lo = Math.floor(lo / 60) * 60;
  hi = Math.ceil(hi / 60) * 60;
  if (hi - lo < 4 * 60) hi = lo + 4 * 60;
  return { lo, hi };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WeekView({ initial, goals, streak, todayISO }: Props) {
  const toast = useToast();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<WeekData>(initial);
  const [loading, setLoading] = useState(false);
  const [replanning, setReplanning] = useState(false);

  const load = useCallback(async (weekOffset: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/schedule?weekOffset=${weekOffset}`);
      setData((await res.json()) as WeekData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (offset === 0) {
      setData(initial);
      return;
    }
    load(offset);
  }, [offset, initial, load]);

  async function toggle(task: WeekTask) {
    const next = !task.completed;
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, completed: next } : t)),
    }));
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: next }),
    });
  }

  async function saveNote(task: WeekTask, notes: string) {
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, notes } : t)),
    }));
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    toast("Note saved");
  }

  async function replan() {
    setReplanning(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekOffset: offset }),
      });
      const result = (await res.json()) as { created: number; source: string };
      await load(offset);
      toast(
        result.created
          ? `Placed ${result.created} task${result.created === 1 ? "" : "s"} into your free hours`
          : "Nothing to place — add a goal first"
      );
    } finally {
      setReplanning(false);
    }
  }

  // Derived --------------------------------------------------------------

  const days = useMemo(() => {
    const start = new Date(data.start);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      return {
        iso,
        dow: d.getUTCDay(),
        num: d.getUTCDate(),
        isToday: iso === todayISO,
        availability: data.availability.find((a) => a.date === iso),
        tasks: data.tasks
          .filter((t) => t.date.slice(0, 10) === iso)
          .sort((a, b) => (a.scheduledStart ?? "z").localeCompare(b.scheduledStart ?? "z")),
      };
    });
  }, [data, todayISO]);

  const { lo, hi } = useMemo(() => axisRange(data.availability, data.tasks), [data]);
  const gridHeight = (hi - lo) * PX_PER_MINUTE;
  const hours: number[] = [];
  for (let m = lo; m <= hi; m += 60) hours.push(m);

  const todayTasks = days.find((d) => d.isToday)?.tasks ?? [];
  const todayDone = todayTasks.filter((t) => t.completed).length;
  const weekDone = data.tasks.filter((t) => t.completed).length;
  const weekPct = data.tasks.length ? Math.round((weekDone / data.tasks.length) * 100) : 0;
  const isCurrentWeek = offset === 0;

  const nowMinute = (() => {
    const n = new Date();
    return n.getUTCHours() * 60 + n.getUTCMinutes();
  })();

  return (
    <div>
      {/* Header ---------------------------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <div className="eyebrow">{isCurrentWeek ? dateLabel(new Date(`${todayISO}T00:00:00Z`)) : "Week of"}</div>
          <h1 className="display mt-1 text-[38px] leading-none">
            {weekRangeLabel(data.start, data.end)}
          </h1>
          {isCurrentWeek && (
            <p className="mt-3 text-[14.5px] text-ink-2">
              {statLine([
                todayTasks.length ? `${todayDone} of ${todayTasks.length} today` : "Nothing scheduled today",
                data.tasks.length ? `${weekPct}% of the week done` : null,
                streak > 0 ? `${streak}-week streak` : null,
                `${goals.length} ${goals.length === 1 ? "goal" : "goals"}`,
              ])}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded border border-rule-2">
            <button onClick={() => setOffset((o) => o - 1)} className="px-[10px] py-[7px] text-ink-2 hover:bg-paper-2" aria-label="Previous week">
              <Chevron dir="left" />
            </button>
            <button
              onClick={() => setOffset(0)}
              disabled={isCurrentWeek}
              className="border-x border-rule-2 px-3 py-[7px] text-[13px] font-medium text-ink hover:bg-paper-2 disabled:text-ink-4 disabled:hover:bg-transparent"
            >
              This week
            </button>
            <button onClick={() => setOffset((o) => o + 1)} className="px-[10px] py-[7px] text-ink-2 hover:bg-paper-2" aria-label="Next week">
              <Chevron dir="right" />
            </button>
          </div>
          <button onClick={replan} disabled={replanning || loading} className="btn-ghost">
            {replanning ? "Replanning…" : "Replan week"}
          </button>
        </div>
      </div>

      {/* Grid ------------------------------------------------------------ */}
      <div className="mt-7 border-t border-rule">
        {/* Day headers */}
        <div className="grid" style={{ gridTemplateColumns: "44px repeat(7, minmax(0, 1fr))" }}>
          <div />
          {days.map((day) => {
            const closed = !day.availability || day.availability.availableMinutes === 0;
            return (
              <div
                key={day.iso}
                className="flex items-baseline gap-[6px] border-l border-rule px-2 pb-2 pt-3"
                style={{ borderTop: day.isToday ? "2px solid #15171c" : "2px solid transparent", marginTop: -1 }}
              >
                <span className={`text-[12px] font-medium ${day.isToday ? "text-ink" : closed ? "text-ink-4" : "text-ink-3"}`}>
                  {DOW[day.dow]}
                </span>
                <span className={`font-mono text-[13px] ${day.isToday ? "text-ink" : closed ? "text-ink-4" : "text-ink-2"}`}>
                  {day.num}
                </span>
                {closed && <span className="ml-auto text-[10.5px] text-ink-4">off</span>}
              </div>
            );
          })}
        </div>

        {/* Time axis + columns */}
        <div className="relative grid" style={{ gridTemplateColumns: "44px repeat(7, minmax(0, 1fr))", height: gridHeight }}>
          {/* Hour labels */}
          <div className="relative">
            {hours.map((m) => (
              <div
                key={m}
                className="absolute right-2 -translate-y-1/2 font-mono text-[10.5px] text-ink-4"
                style={{ top: (m - lo) * PX_PER_MINUTE }}
              >
                {m === hi ? null : minutesToHHMM(m)}
              </div>
            ))}
          </div>

          {days.map((day) => (
            <div key={day.iso} className="relative border-l border-rule">
              {/* Hour rules */}
              {hours.slice(1, -1).map((m) => (
                <div key={m} className="absolute inset-x-0 border-t border-rule" style={{ top: (m - lo) * PX_PER_MINUTE, opacity: 0.6 }} />
              ))}

              {/* Free windows */}
              {loading ? (
                <div className="skeleton absolute inset-x-1 top-2 bottom-2" />
              ) : (
                day.availability?.blocks.map((b, i) => (
                  <div
                    key={i}
                    className="absolute inset-x-1 rounded-sm bg-paper-2"
                    style={{ top: (b.startMinute - lo) * PX_PER_MINUTE, height: (b.endMinute - b.startMinute) * PX_PER_MINUTE }}
                  />
                ))
              )}

              {/* Tasks */}
              {!loading &&
                day.tasks.map((t) => {
                  const s = minuteOfDay(t.scheduledStart);
                  const e = minuteOfDay(t.scheduledEnd);
                  if (s == null || e == null) return null;
                  const top = (s - lo) * PX_PER_MINUTE;
                  const height = Math.max(MIN_BLOCK_PX, (e - s) * PX_PER_MINUTE);
                  // From ~34px the time gets its own line; from ~48px the
                  // title can wrap to two. Below that, time and title share
                  // one line. Hovering always shows the full title.
                  const tall = height >= 34;
                  const twoLines = height >= 48;
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggle(t)}
                      title={`${t.title}${t.description ? ` — ${t.description}` : ""}`}
                      className="absolute inset-x-[6px] overflow-hidden rounded-sm text-left transition-opacity hover:opacity-90"
                      style={{
                        top,
                        height,
                        background: goalSoft(t.goal.hue),
                        borderLeft: `2px solid ${goalColor(t.goal.hue)}`,
                        color: goalInk(t.goal.hue),
                        opacity: t.completed ? 0.5 : 1,
                      }}
                    >
                      <div className="px-[7px] py-[3px]">
                        {tall ? (
                          <>
                            <div className="font-mono text-[10px] leading-[1.2] opacity-80">
                              {timeFromISO(t.scheduledStart)}
                            </div>
                            <div
                              className={`${twoLines ? "line-clamp-2" : "truncate"} text-[12px] font-medium leading-[1.25]`}
                              style={{ textDecoration: t.completed ? "line-through" : "none" }}
                            >
                              {t.title}
                            </div>
                          </>
                        ) : (
                          <div className="flex items-baseline gap-[5px] text-[12px] leading-[1.3]">
                            <span className="flex-shrink-0 font-mono text-[10px] opacity-80">{timeFromISO(t.scheduledStart)}</span>
                            <span
                              className="truncate font-medium"
                              style={{ textDecoration: t.completed ? "line-through" : "none" }}
                            >
                              {t.title}
                            </span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}

              {/* Now */}
              {day.isToday && nowMinute >= lo && nowMinute <= hi && (
                <div className="pointer-events-none absolute inset-x-0 border-t border-ink" style={{ top: (nowMinute - lo) * PX_PER_MINUTE }}>
                  <span className="absolute -left-[3px] -top-[3px] h-[5px] w-[5px] rounded-full bg-ink" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Un-slotted tasks: scheduled for a day but with no room in its windows. */}
        {days.some((d) => d.tasks.some((t) => !t.scheduledStart)) && (
          <div className="grid border-t border-rule" style={{ gridTemplateColumns: "44px repeat(7, minmax(0, 1fr))" }}>
            <div className="pt-2 pr-2 text-right font-mono text-[10.5px] text-ink-4">—</div>
            {days.map((day) => (
              <div key={day.iso} className="border-l border-rule px-[6px] pt-2">
                {day.tasks
                  .filter((t) => !t.scheduledStart)
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => toggle(t)}
                      className="mb-1 block w-full truncate rounded-sm border border-dashed px-[7px] py-[3px] text-left text-[12px]"
                      style={{ borderColor: goalColor(t.goal.hue), color: goalInk(t.goal.hue), opacity: t.completed ? 0.5 : 1 }}
                    >
                      {t.title}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Empty week */}
      {!loading && data.tasks.length === 0 && (
        <div className="mt-4 text-[14px] text-ink-3">
          {goals.length === 0 ? (
            <>
              Nothing here yet — the week&apos;s wide open.{" "}
              <Link href="/goals/new" className="btn-text">Add a goal</Link> and it will fill in.
            </>
          ) : (
            <>
              No tasks placed this week.{" "}
              <button onClick={replan} className="btn-text">Replan it</button> to lay your goals into these windows.
            </>
          )}
        </div>
      )}

      {/* Below the grid ---------------------------------------------------- */}
      <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="display text-[26px]">{isCurrentWeek ? "Today" : "This week"}</h2>
            {isCurrentWeek && todayTasks.length > 0 && (
              <span className="font-mono text-[12.5px] text-ink-3">{todayDone} / {todayTasks.length}</span>
            )}
          </div>
          <div className="mt-3 border-t border-rule">
            {(isCurrentWeek ? todayTasks : data.tasks).length === 0 ? (
              <p className="py-6 text-[14px] text-ink-3">
                {isCurrentWeek ? "Nothing scheduled today. A free day is allowed." : "Nothing scheduled."}
              </p>
            ) : (
              (isCurrentWeek ? todayTasks : data.tasks).map((t) => (
                <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} onNote={(n) => saveNote(t, n)} showDate={!isCurrentWeek} />
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="display text-[26px]">Goals</h2>
          <div className="mt-3 border-t border-rule">
            {goals.length === 0 ? (
              <p className="py-6 text-[14px] text-ink-3">
                No goals yet.{" "}
                <Link href="/goals/new" className="btn-text">Start one</Link>
              </p>
            ) : (
              goals.map((g) => (
                <Link key={g.id} href={`/goals/${g.id}`} className="row group block py-[13px]">
                  <div className="flex items-baseline gap-[10px]">
                    <span className="mt-[2px] h-[8px] w-[8px] flex-shrink-0 self-center rounded-full" style={{ background: goalColor(g.hue) }} />
                    <span className="flex-1 truncate text-[15px] font-medium text-ink group-hover:underline group-hover:underline-offset-[3px]">{g.title}</span>
                    <span className="font-mono text-[12.5px] text-ink-3">{g.progress}%</span>
                  </div>
                  {g.activeMilestone && (
                    <div className="mt-[3px] pl-[18px] text-[13px] text-ink-3">{g.activeMilestone}</div>
                  )}
                  <div className="ml-[18px] mt-2 h-px bg-paper-3">
                    <div className="h-px" style={{ width: `${g.progress}%`, background: goalColor(g.hue) }} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function statLine(parts: (string | null)[]): string {
  return parts.filter(Boolean).join(" · ");
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {dir === "left" ? <path d="M10 4 L6 8 L10 12" /> : <path d="M6 4 L10 8 L6 12" />}
    </svg>
  );
}

function TaskRow({
  task,
  onToggle,
  onNote,
  showDate,
}: {
  task: WeekTask;
  onToggle: () => void;
  onNote: (notes: string) => void;
  showDate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(task.notes ?? "");
  const color = goalColor(task.goal.hue);

  return (
    <div className="row group">
      <div className="flex items-start gap-3 py-[12px]">
        <button
          onClick={onToggle}
          aria-label={task.completed ? "Mark not done" : "Mark done"}
          className="mt-[3px] flex h-[16px] w-[16px] flex-shrink-0 items-center justify-center rounded-sm border transition-colors"
          style={{ borderColor: task.completed ? color : "rgba(21,23,28,0.35)", background: task.completed ? color : "transparent" }}
        >
          {task.completed && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#f4f5f7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 5.2 L4.2 7.4 L8 3.2" />
            </svg>
          )}
        </button>
        <span className="w-[46px] flex-shrink-0 pt-px font-mono text-[12.5px] text-ink-3">
          {showDate ? `${DOW[new Date(task.date).getUTCDay()]} ${new Date(task.date).getUTCDate()}` : timeFromISO(task.scheduledStart) || "—"}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`text-[15px] ${task.completed ? "text-ink-3 line-through" : "text-ink"}`}>{task.title}</div>
          {task.description && <div className="mt-px text-[13px] text-ink-3">{task.description}</div>}
          {open && (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => draft !== (task.notes ?? "") && onNote(draft)}
              placeholder="How did it go? The weekly review reads this."
              maxLength={LIMITS.notes}
              className="field mt-2 min-h-[64px] resize-y text-[13.5px]"
              autoFocus
            />
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-3 pt-px">
          <span className="inline-flex items-center gap-[6px] text-[12.5px] text-ink-3">
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
            {task.goal.title}
          </span>
          <button
            onClick={() => setOpen((v) => !v)}
            className={`text-[12.5px] underline-offset-[3px] transition-opacity hover:underline focus-visible:opacity-100 ${
              task.notes || open ? "text-ink opacity-100" : "text-ink-3 opacity-0 group-hover:opacity-100"
            }`}
          >
            {task.notes ? "Note" : "Add note"}
          </button>
        </div>
      </div>
    </div>
  );
}
