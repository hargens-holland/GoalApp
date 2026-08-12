"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";

export default function GoalDetailActions({ goalId }: { goalId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function review() {
    setBusy(true);
    try {
      const res = await fetch(`/api/goals/${goalId}/review`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast(data?.assessment?.summary ?? "Progress updated");
      router.refresh();
    } catch {
      toast("Couldn't review — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-shrink-0 gap-[9px]">
      <button onClick={review} disabled={busy} className="btn-ghost whitespace-nowrap">
        {busy ? "Reviewing…" : "Review progress"}
      </button>
      <button onClick={() => toast("Adjust roadmap — coming soon")} className="btn-ghost whitespace-nowrap">
        Adjust roadmap
      </button>
    </div>
  );
}
