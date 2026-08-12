"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = 0 | 1 | 2;

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
      setError("Something went wrong — try again");
    } finally {
      setLoadingQuestions(false);
    }
  }

  async function build(finalAnswers: string[]) {
    setStep(2);
    setError("");
    const clarifications = questions.map((q, i) => ({ question: q, answer: finalAnswers[i] || "(no answer)" }));
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, clarifications }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { goalId: string };
      router.push(`/goals/${data.goalId}`);
      router.refresh();
    } catch {
      setError("Failed to build roadmap — try again");
      setStep(1);
    }
  }

  function next() {
    const updated = [...answers];
    updated[qIndex] = answer;
    setAnswers(updated);
    setAnswer("");
    if (qIndex < questions.length - 1) {
      setQIndex(qIndex + 1);
    } else {
      build(updated);
    }
  }

  function skip() {
    const updated = [...answers];
    updated[qIndex] = "";
    setAnswers(updated);
    setAnswer("");
    if (qIndex < questions.length - 1) setQIndex(qIndex + 1);
    else build(updated);
  }

  const seg = (active: boolean) => (active ? "#6d56f0" : "rgba(255,255,255,0.1)");

  return (
    <div className="mx-auto mt-[30px] max-w-[580px]">
      <div className="mb-[26px] flex gap-[7px]">
        <div className="h-1 flex-1 rounded-full" style={{ background: seg(step >= 0) }} />
        <div className="h-1 flex-1 rounded-full" style={{ background: seg(step >= 1) }} />
        <div className="h-1 flex-1 rounded-full" style={{ background: seg(step >= 2) }} />
      </div>

      {error && <div className="mb-4 rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">{error}</div>}

      {step === 0 && (
        <div>
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#a899ff]">New goal · Step 1 of 3</div>
          <div className="mb-2 text-[25px] font-bold tracking-[-0.02em]">What do you want to achieve?</div>
          <div className="mb-5 text-[14.5px] leading-[1.5] text-ink-3">
            State it in plain language. The Architect agent turns it into a sequenced roadmap, then the Scheduler drops the first tasks into your calendar.
          </div>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Learn to play three fingerstyle guitar songs from memory by the end of the year"
            className="min-h-[120px] w-full resize-y rounded-[14px] border border-[rgba(255,255,255,0.1)] bg-[#121217] px-[17px] py-[15px] text-[15px] leading-[1.5] text-ink outline-none focus:border-primary"
            autoFocus
          />
          <button
            onClick={start}
            disabled={goal.trim().length < 4 || loadingQuestions}
            className="mt-[18px] w-full rounded-[12px] bg-primary py-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-40"
          >
            {loadingQuestions ? "Thinking…" : "Continue"}
          </button>
        </div>
      )}

      {step === 1 && questions.length > 0 && (
        <div>
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#a899ff]">
            A few quick questions · {qIndex + 1} of {questions.length}
          </div>
          <div className="mb-5 text-[24px] font-bold leading-[1.3] tracking-[-0.02em]">{questions[qIndex]}</div>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer…"
            className="min-h-[100px] w-full resize-y rounded-[14px] border border-[rgba(255,255,255,0.1)] bg-[#121217] px-[17px] py-[15px] text-[15px] leading-[1.5] text-ink outline-none focus:border-primary"
            autoFocus
          />
          <div className="mt-[18px] flex gap-[10px]">
            <button onClick={skip} className="rounded-[12px] border border-[rgba(255,255,255,0.1)] bg-transparent px-5 py-[13px] text-[14px] font-medium text-ink-2 transition-colors hover:bg-[rgba(255,255,255,0.05)]">Skip</button>
            <button onClick={next} className="flex-1 rounded-[12px] bg-primary py-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover">
              {qIndex < questions.length - 1 ? "Continue" : "Build roadmap"}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col items-center py-10 text-center">
          <div className="mb-[22px] h-[46px] w-[46px] animate-spin rounded-full border-[3px] border-[rgba(255,255,255,0.1)] border-t-primary" />
          <div className="mb-2 text-[21px] font-bold tracking-[-0.01em]">Building your roadmap…</div>
          <div className="max-w-[340px] text-[14px] leading-[1.5] text-ink-3">
            The Architect is breaking your goal into milestones and the Scheduler is placing this week&apos;s tasks into your free time.
          </div>
        </div>
      )}
    </div>
  );
}
