"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Step = 0 | 1 | 2;

/**
 * Three screens: state the goal, answer a few questions, wait. The copy talks
 * about what the user gets, not about which agent produces it.
 */
export default function ChatUI() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [goal, setGoal] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  /** Which half of the two-request build is in flight, for the progress copy. */
  const [phase, setPhase] = useState<"roadmap" | "schedule">("roadmap");
  // Read on the client after mount so the server render matches the first paint.
  const [modKey, setModKey] = useState("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform) || /Mac/.test(navigator.userAgent)) setModKey("⌘");
  }, []);

  async function start() {
    if (goal.trim().length < 4) return;
    setLoadingQuestions(true);
    setError("");
    try {
      const res = await fetch("/api/goals/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { questions: string[] };
      setQuestions(data.questions);
      setAnswers(new Array(data.questions.length).fill(""));
      setQIndex(0);
      setAnswer("");
      setStep(1);
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setLoadingQuestions(false);
    }
  }

  /**
   * Build the goal in two requests rather than one.
   *
   * The server creates the goal and its roadmap (one model call) and returns
   * immediately; scheduling the week is a second call. This keeps either
   * request well inside a serverless function's time limit, and means a
   * scheduling failure doesn't lose the roadmap the user just waited for.
   */
  async function build(finalAnswers: string[]) {
    setStep(2);
    setPhase("roadmap");
    setError("");
    const clarifications = questions.map((q, i) => ({ question: q, answer: finalAnswers[i] || "(no answer)" }));

    let goalId: string;
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, clarifications }),
      });
      if (!res.ok) throw new Error();
      ({ goalId } = (await res.json()) as { goalId: string });
    } catch {
      setError("Couldn't build the roadmap — try again.");
      setStep(1);
      return;
    }

    // The goal exists from here on. Scheduling is best-effort: if it fails the
    // user still gets their roadmap, and the week can be re-planned from the
    // week page. So this never blocks the redirect on an error.
    setPhase("schedule");
    try {
      await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekOffset: 0 }),
      });
    } catch {
      // Intentionally ignored — see above.
    }

    router.push(`/goals/${goalId}`);
    router.refresh();
  }

  function advance(value: string) {
    const updated = [...answers];
    updated[qIndex] = value;
    setAnswers(updated);
    setAnswer("");
    if (qIndex < questions.length - 1) setQIndex(qIndex + 1);
    else build(updated);
  }

  return (
    <div className="mx-auto mt-10 max-w-[600px]">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">New goal</span>
        <span className="font-mono text-[12px] text-ink-4">{step + 1} / 3</span>
      </div>

      {error && <p className="mt-4 text-[13.5px] text-danger">{error}</p>}

      {step === 0 && (
        <div className="mt-3">
          <h1 className="display text-[40px] leading-[1.05]">What do you want to achieve?</h1>
          <p className="mt-4 text-[15.5px] leading-[1.55] text-ink-2">
            Say it plainly, with a deadline if you have one. You&apos;ll get a roadmap of milestones and this
            week&apos;s first steps, placed into the hours you&apos;re free.
          </p>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start(); }}
            placeholder="Play three fingerstyle guitar songs from memory by December"
            className="field mt-7 min-h-[120px] resize-y text-[17px] leading-[1.5]"
            autoFocus
          />
          <div className="mt-5 flex items-center justify-between">
            <span className="text-[12.5px] text-ink-4">{modKey}{modKey === "⌘" ? "" : "+"}↵ to continue</span>
            <button onClick={start} disabled={goal.trim().length < 4 || loadingQuestions} className="btn">
              {loadingQuestions ? "One moment…" : "Continue"}
            </button>
          </div>
        </div>
      )}

      {step === 1 && questions.length > 0 && (
        <div className="mt-3">
          <p className="text-[13px] text-ink-3">
            Question {qIndex + 1} of {questions.length}
          </p>
          <h1 className="display mt-2 text-[34px] leading-[1.15]">{questions[qIndex]}</h1>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) advance(answer); }}
            placeholder="A sentence is plenty"
            className="field mt-7 min-h-[100px] resize-y text-[16px] leading-[1.5]"
            autoFocus
          />
          <div className="mt-5 flex items-center justify-between">
            <button onClick={() => advance("")} className="btn-text">Skip</button>
            <button onClick={() => advance(answer)} className="btn">
              {qIndex < questions.length - 1 ? "Continue" : "Build the roadmap"}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-3">
          <h1 className="display text-[34px] leading-[1.15]">
            {phase === "roadmap" ? "Building your roadmap" : "Placing this week"}
            <Ellipsis />
          </h1>
          <p className="mt-4 text-[15px] leading-[1.55] text-ink-2">
            {phase === "roadmap"
              ? "Breaking the goal into a sequence of milestones, each with a way to tell it's done."
              : "Fitting the first tasks into your free hours, balanced against your other goals."}
          </p>
          <div className="mt-10 space-y-5">
            {[0.7, 0.55, 0.62, 0.45].map((w, i) => (
              <div key={i} className="flex gap-4">
                <div className="skeleton mt-1 h-[11px] w-[11px] rounded-full" />
                <div className="flex-1">
                  <div className="skeleton h-[14px]" style={{ width: `${w * 100}%` }} />
                  <div className="skeleton mt-2 h-[11px]" style={{ width: `${Math.min(95, w * 100 + 25)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Ellipsis() {
  return (
    <span className="inline-flex w-[1.2em] justify-start">
      <span className="animate-pulse">…</span>
    </span>
  );
}
