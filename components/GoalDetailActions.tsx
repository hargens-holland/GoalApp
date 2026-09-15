"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import { LIMITS } from "@/lib/validation";

/**
 * The two ways a user changes a goal after creation: ask for a weekly review
 * (Progress agent) or ask for the roadmap to be revised (Architect agent,
 * then the Scheduler re-lays the week).
 */
export default function GoalDetailActions({ goalId }: { goalId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"review" | "adjust" | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [request, setRequest] = useState("");

  async function review() {
    setBusy("review");
    try {
      const res = await fetch(`/api/goals/${goalId}/review`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast(data?.assessment?.summary ?? "Progress updated");
      router.refresh();
    } catch {
      toast("Couldn't run the review — try again");
    } finally {
      setBusy(null);
    }
  }

  async function adjust() {
    if (request.trim().length < 4) return;
    setBusy("adjust");
    try {
      const res = await fetch(`/api/goals/${goalId}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "roadmap", request }),
      });
      if (!res.ok) throw new Error();
      toast("Roadmap revised and the week re-planned");
      setAdjusting(false);
      setRequest("");
      router.refresh();
    } catch {
      toast("Couldn't revise the roadmap — try again");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-shrink-0 flex-col items-end gap-3">
      <div className="flex gap-2">
        <button onClick={review} disabled={busy !== null} className="btn-ghost whitespace-nowrap">
          {busy === "review" ? "Reviewing…" : "Weekly review"}
        </button>
        <button onClick={() => setAdjusting((v) => !v)} disabled={busy !== null} className="btn-ghost whitespace-nowrap">
          Revise roadmap
        </button>
      </div>
      {adjusting && (
        <div className="w-[360px]">
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="What should change? e.g. “I have half the time I thought — stretch this over six months.”"
            maxLength={LIMITS.request}
            className="field min-h-[80px] resize-y text-[13.5px]"
            autoFocus
          />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setAdjusting(false)} className="btn-text">Cancel</button>
            <button onClick={adjust} disabled={busy !== null || request.trim().length < 4} className="btn">
              {busy === "adjust" ? "Revising…" : "Revise"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
