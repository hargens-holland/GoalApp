"use client";

import { useState } from "react";
import type { Intent } from "@/lib/agents/schemas";
import { LIMITS } from "@/lib/validation";

/**
 * One line of plain language in, one proposal out, one click to apply.
 *
 * "Can't do today" → "Mark 2 tasks on Wed 16 as skipped; re-lay Thu–Sat" →
 * [Do it]. Nothing changes until the button. The classification is the
 * Coordinator agent's; the execution is the same code the buttons use.
 */

interface Proposal {
  intent: Intent;
  summary: string;
  effects: string[];
  actionable: boolean;
  callsModel: boolean;
  source: "llm" | "fallback";
}

const EXAMPLES = [
  "can't do today, reschedule",
  "pause the guitar this week",
  "how am I doing on Spanish?",
  "I have half the time I thought for the marathon",
];

export default function Assistant({ onApplied }: { onApplied: (summary: string) => void }) {
  const [message, setMessage] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState<"thinking" | "applying" | null>(null);
  const [error, setError] = useState("");
  const [example] = useState(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]);

  async function ask() {
    if (message.trim().length < 2 || busy) return;
    setBusy("thinking");
    setError("");
    setProposal(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setProposal(data as Proposal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!proposal || busy) return;
    setBusy("applying");
    setError("");
    try {
      const res = await fetch("/api/assistant/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: proposal.intent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't apply that");
      setProposal(null);
      setMessage("");
      onApplied(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't apply that");
    } finally {
      setBusy(null);
    }
  }

  function dismiss() {
    setProposal(null);
    setError("");
  }

  return (
    <div className="mt-7">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        className="flex items-center gap-2 border-b border-rule-2 pb-2 focus-within:border-ink"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0 text-ink-3" aria-hidden>
          <path d="M8 2 L9.4 6.6 L14 8 L9.4 9.4 L8 14 L6.6 9.4 L2 8 L6.6 6.6 Z" strokeLinejoin="round" />
        </svg>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={LIMITS.assistantMessage}
          placeholder={`Tell the planner something — “${example}”`}
          aria-label="Tell the planner something"
          className="flex-1 bg-transparent py-1 text-[15px] text-ink outline-none placeholder:text-ink-4"
          disabled={busy !== null}
        />
        <button type="submit" disabled={message.trim().length < 2 || busy !== null} className="btn-text disabled:opacity-40">
          {busy === "thinking" ? "Thinking…" : "Ask"}
        </button>
      </form>

      {error && <p className="mt-3 text-[13.5px] text-danger">{error}</p>}

      {proposal && (
        <div className="mt-4 border-l-2 border-ink pl-4">
          <p className="text-[15px] leading-[1.5] text-ink">{proposal.summary}</p>
          {proposal.effects.length > 0 && (
            <ul className="mt-2 space-y-1 text-[13.5px] leading-[1.5] text-ink-2">
              {proposal.effects.map((e, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-ink-4">→</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-3">
            {proposal.actionable ? (
              <>
                <button onClick={confirm} disabled={busy !== null} className="btn">
                  {busy === "applying" ? (proposal.callsModel ? "Working — this takes a moment…" : "Applying…") : "Do it"}
                </button>
                <button onClick={dismiss} disabled={busy !== null} className="btn-text">Never mind</button>
              </>
            ) : (
              <button onClick={dismiss} className="btn-ghost">OK</button>
            )}
            {proposal.source === "fallback" && (
              <span className="ml-auto text-[11.5px] text-ink-4" title="No model available; keyword matching was used.">
                understood without a model
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
