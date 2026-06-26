"use client";

interface SnapshotStat {
  weekNumber: number;
  year: number;
  total: number;
  done: number;
  rate: number;
}

interface Note {
  taskTitle: string;
  note: string;
}

interface StatsViewProps {
  totalTasks: number;
  completedTasks: number;
  streak: number;
  snapshots: SnapshotStat[];
  recentNotes: Note[];
}

export function StatsView({ totalTasks, completedTasks, streak, snapshots, recentNotes }: StatsViewProps) {
  const rate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* This week */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">This week</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-3xl font-bold text-white tabular-nums">{completedTasks}</p>
            <p className="text-xs text-zinc-500 mt-0.5">tasks done</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-white tabular-nums">{rate}%</p>
            <p className="text-xs text-zinc-500 mt-0.5">completion</p>
          </div>
        </div>
        {streak > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center gap-2">
            <span className="text-lg">🔥</span>
            <div>
              <p className="text-sm font-semibold text-white">{streak}-week streak</p>
              <p className="text-xs text-zinc-500">Keep it going</p>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      {snapshots.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">History</p>
          <div className="space-y-2.5">
            {snapshots.slice(0, 6).map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-zinc-600 w-12 shrink-0 tabular-nums">Wk {s.weekNumber}</span>
                <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${s.rate >= 0.5 ? "bg-indigo-500" : "bg-zinc-600"}`}
                    style={{ width: `${s.rate * 100}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-600 tabular-nums w-8 text-right">{s.done}/{s.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {recentNotes.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">Recent notes</p>
          <div className="space-y-3">
            {recentNotes.map((n, i) => (
              <div key={i}>
                <p className="text-xs font-medium text-zinc-500">{n.taskTitle}</p>
                <p className="text-sm text-zinc-300 mt-0.5">{n.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
