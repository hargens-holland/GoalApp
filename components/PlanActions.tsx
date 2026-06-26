"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "./LoadingSpinner";

export default function PlanActions({ planId }: { planId: string; hasLastWeek: boolean }) {
  const router = useRouter();
  const [adjustText, setAdjustText] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [adjustError, setAdjustError] = useState("");
  const [regenError, setRegenError] = useState("");
  const [regenSuccess, setRegenSuccess] = useState("");

  async function handleAdjust() {
    if (!adjustText.trim()) return;
    setAdjusting(true);
    setAdjustError("");
    try {
      const res = await fetch(`/api/plans/${planId}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustment: adjustText }),
      });
      if (!res.ok) throw new Error();
      setAdjustText("");
      router.refresh();
    } catch {
      setAdjustError("Failed to adjust — try again");
    } finally {
      setAdjusting(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setRegenError("");
    setRegenSuccess("");
    try {
      const res = await fetch(`/api/plans/${planId}/regenerate`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json() as { weekNumber: number };
      setRegenSuccess(`Week ${data.weekNumber} tasks generated.`);
    } catch {
      setRegenError("Failed to regenerate — try again");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Adjust */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Adjust this week</p>
        <p className="text-xs text-zinc-600 mb-3">Tell AI what to change — e.g. &quot;less intense&quot; or &quot;add more cardio&quot;</p>
        <textarea
          value={adjustText}
          onChange={(e) => setAdjustText(e.target.value)}
          placeholder="What would you like to change?"
          rows={2}
          className="input text-sm resize-none mb-3"
        />
        {adjustError && <p className="text-xs text-red-400 mb-2">{adjustError}</p>}
        <button onClick={handleAdjust} disabled={adjusting || !adjustText.trim()} className="btn-secondary text-sm">
          {adjusting ? <><LoadingSpinner size="sm" /> Adjusting…</> : "Adjust plan"}
        </button>
      </div>

      {/* Regenerate */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Next week</p>
        <p className="text-xs text-zinc-600 mb-3">Generate next week&apos;s tasks based on this week&apos;s progress.</p>
        {regenSuccess && (
          <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2 text-xs text-indigo-400 mb-3">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {regenSuccess}
          </div>
        )}
        {regenError && <p className="text-xs text-red-400 mb-2">{regenError}</p>}
        <button onClick={handleRegenerate} disabled={regenerating} className="btn-primary text-sm">
          {regenerating ? <><LoadingSpinner size="sm" /> Generating…</> : "Generate next week"}
        </button>
      </div>
    </div>
  );
}
