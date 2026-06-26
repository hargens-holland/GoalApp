"use client";

import { useState } from "react";

interface Task {
  id: string;
  title: string;
  description: string;
  order: number;
  completed: boolean;
  notes: string;
  metadata: Record<string, unknown> | null;
}

export function TaskItem({ planId, task }: { planId: string; task: Task }) {
  const [completed, setCompleted] = useState(task.completed);
  const [notes, setNotes] = useState(task.notes);
  const [showNotes, setShowNotes] = useState(!!task.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(newCompleted: boolean, newNotes: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, taskId: task.id, completed: newCompleted, notes: newNotes || null }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleCheck(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    setCompleted(checked);
    save(checked, notes);
  }

  return (
    <div className={`rounded-lg border transition-all duration-150 ${
      completed
        ? "bg-zinc-900/50 border-zinc-800/50"
        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
    }`}>
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <input
              type="checkbox"
              checked={completed}
              onChange={handleCheck}
              disabled={saving}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-zinc-900 cursor-pointer"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium leading-snug transition-colors ${
              completed ? "line-through text-zinc-600" : "text-zinc-100"
            }`}>
              {task.title}
            </p>
            {task.description && !completed && (
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{task.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {saving && <span className="text-xs text-zinc-600">saving…</span>}
            <button
              onClick={() => setShowNotes(!showNotes)}
              className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              {showNotes ? "hide" : "note"}
            </button>
          </div>
        </div>

        {error && <p className="mt-1.5 pl-7 text-xs text-red-400">{error}</p>}

        {showNotes && (
          <div className="mt-2.5 pl-7">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => save(completed, notes)}
              placeholder="Add a note, metric, or reflection…"
              rows={2}
              className="input text-xs resize-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
