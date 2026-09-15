import { goalColor } from "@/lib/colors";

/**
 * The roadmap drawn as a timeline.
 *
 * Milestones carry a `targetWeekOffset` from the Architect — the week each
 * one is due — so they have a natural position on a week-scaled axis, and the
 * goal's age gives a "now" marker on the same axis. A due dot to the left of
 * "now" that isn't filled is a milestone running late; that reading is the
 * whole point of drawing it. Everything here is static markup.
 */

export interface TimelineMilestone {
  id: string;
  title: string;
  description: string | null;
  successCriteria: string | null;
  order: number;
  targetWeekOffset: number | null;
  status: string; // done | active | locked
}

interface Props {
  milestones: TimelineMilestone[];
  hue: number;
  /** Whole weeks since the goal was created. */
  weeksElapsed: number;
}

export default function RoadmapTimeline({ milestones, hue, weeksElapsed }: Props) {
  const color = goalColor(hue);
  const sorted = [...milestones].sort((a, b) => a.order - b.order);
  const weekOf = (m: TimelineMilestone, i: number) => m.targetWeekOffset ?? i * 4;

  // The axis runs from week 0 to a little past the last milestone, and always
  // far enough to include "now" so the marker never falls off the end.
  const lastWeek = sorted.length ? weekOf(sorted[sorted.length - 1], sorted.length - 1) : 0;
  const span = Math.max(lastWeek + 1, weeksElapsed + 1, 4);
  const pct = (week: number) => `${Math.min(100, Math.max(0, (week / span) * 100))}%`;

  return (
    <div>
      {/* Axis ---------------------------------------------------------- */}
      <div className="relative mt-2 h-[44px]">
        <div className="absolute inset-x-0 top-[14px] h-px bg-rule-2" />

        {/* Elapsed portion of the axis, in the goal's color. */}
        <div className="absolute left-0 top-[14px] h-px" style={{ width: pct(weeksElapsed), background: color }} />

        {sorted.map((m, i) => {
          const w = weekOf(m, i);
          const done = m.status === "done";
          const active = m.status === "active";
          return (
            <div key={m.id} className="absolute -translate-x-1/2" style={{ left: pct(w) }}>
              <Dot state={done ? "done" : active ? "active" : "upcoming"} color={color} />
              <div className="mt-[6px] -translate-x-1/2 whitespace-nowrap font-mono text-[10.5px] text-ink-4" style={{ marginLeft: "50%" }}>
                wk {w}
              </div>
            </div>
          );
        })}

        {/* Now */}
        <div className="absolute top-[6px] -translate-x-1/2" style={{ left: pct(weeksElapsed) }}>
          <div className="mx-auto h-[17px] w-px bg-ink" />
          <div className="mt-[7px] -translate-x-1/2 whitespace-nowrap text-[10.5px] font-medium text-ink" style={{ marginLeft: "50%" }}>
            now
          </div>
        </div>
      </div>

      {/* List ----------------------------------------------------------- */}
      <ol className="mt-8 border-t border-rule">
        {sorted.map((m) => {
          const done = m.status === "done";
          const active = m.status === "active";
          return (
            <li key={m.id} className="row flex gap-4 py-4">
              <div className="mt-[5px] flex-shrink-0">
                <Dot state={done ? "done" : active ? "active" : "upcoming"} color={color} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[16px] ${active ? "font-medium text-ink" : done ? "text-ink-2" : "text-ink-3"}`}>
                  {m.title}
                  {active && <span className="ml-2 text-[12.5px] font-normal text-ink-3">current</span>}
                </div>
                {m.description && <p className="mt-[3px] text-[14px] leading-[1.5] text-ink-2">{m.description}</p>}
                {m.successCriteria && (
                  <p className="mt-[5px] text-[13px] leading-[1.5] text-ink-3">
                    <span className="italic">Done when</span> — {m.successCriteria}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Dot({ state, color }: { state: "done" | "active" | "upcoming"; color: string }) {
  if (state === "done") {
    return <span className="block h-[11px] w-[11px] rounded-full" style={{ background: color }} />;
  }
  if (state === "active") {
    return (
      <span className="flex h-[11px] w-[11px] items-center justify-center rounded-full border-[1.5px]" style={{ borderColor: color, background: "#f4f5f7" }}>
        <span className="h-[5px] w-[5px] rounded-full" style={{ background: color }} />
      </span>
    );
  }
  return <span className="block h-[11px] w-[11px] rounded-full border-[1.5px] border-ink-4" style={{ background: "#f4f5f7" }} />;
}
