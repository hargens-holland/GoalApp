"use client";

import Link from "next/link";
import { useState } from "react";
import { TaskItem } from "./TaskItem";

interface Completion {
  completed: boolean;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  order: number;
  completions: Completion[];
}

interface Plan {
  id: string;
  title: string;
  goal: string;
  tasks: Task[];
}

interface PlanCardProps {
  plan: Plan;
  weekNumber: number;
  year: number;
}

export function PlanCard({ plan, weekNumber }: PlanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const total = plan.tasks.length;
  const done = plan.tasks.filter((t) => t.completions.some((c) => c.completed)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const serializedTasks = plan.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    order: t.order,
    completed: t.completions.some((c) => c.completed),
    completionId: null,
    notes: "",
    metadata: null,
  }));

  return (
    <div className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl transition-colors duration-150">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Link
              href={`/plans/${plan.id}`}
              className="text-base font-semibold text-white hover:text-indigo-400 transition-colors"
            >
              {plan.title}
            </Link>
            <p className="text-sm text-zinc-500 mt-0.5 truncate">{plan.goal}</p>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1 h-1 bg-zinc-800 rounded-full max-w-36 overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500 tabular-nums">
                {done}/{total}
              </span>
              {pct === 100 && (
                <span className="text-xs text-indigo-400 font-medium">complete</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            {total > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="btn-ghost text-xs px-2.5 py-1"
              >
                {expanded ? "collapse" : "quick view"}
              </button>
            )}
            <Link href={`/plans/${plan.id}`} className="btn-secondary text-xs px-3 py-1.5">
              Open
            </Link>
          </div>
        </div>
      </div>

      {expanded && serializedTasks.length > 0 && (
        <div className="border-t border-zinc-800 px-5 py-4 space-y-1.5">
          {serializedTasks.map((task) => (
            <TaskItem key={task.id} planId={plan.id} task={task} />
          ))}
        </div>
      )}

      {total === 0 && (
        <div className="border-t border-zinc-800 px-5 py-3">
          <p className="text-xs text-zinc-600">
            No tasks for week {weekNumber}.{" "}
            <Link href={`/plans/${plan.id}`} className="text-indigo-500 hover:text-indigo-400 transition-colors">
              Open plan →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
