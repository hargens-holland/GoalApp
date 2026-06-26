"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "./LoadingSpinner";

type Step = "goal" | "questions" | "generating" | "done";

interface QA {
  question: string;
  answer: string;
}

const STEPS = ["Goal", "Clarify", "Generate"];

export default function ChatUI() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("goal");
  const [goal, setGoal] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const stepIndex = step === "goal" ? 0 : step === "questions" ? 1 : 2;

  async function handleGoalSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!goal.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/plans/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { questions: string[] };
      setQuestions(data.questions);
      setAnswers(new Array(data.questions.length).fill(""));
      setStep("questions");
    } catch {
      setError("Something went wrong — try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnswerSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newAnswers = [...answers];
    newAnswers[currentQIndex] = currentAnswer;
    setAnswers(newAnswers);
    setCurrentAnswer("");

    if (currentQIndex < questions.length - 1) {
      setCurrentQIndex(currentQIndex + 1);
    } else {
      await generatePlan(newAnswers);
    }
  }

  async function generatePlan(finalAnswers: string[]) {
    setStep("generating");
    setError("");

    const clarifications: QA[] = questions.map((q, i) => ({
      question: q,
      answer: finalAnswers[i] || "(no answer)",
    }));

    try {
      const res = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, clarifications }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { planId: string };
      router.push(`/plans/${data.planId}`);
      router.refresh();
    } catch {
      setError("Failed to generate plan — try again");
      setStep("questions");
    }
  }

  return (
    <div className="space-y-6">
      {/* Step progress */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              i === stepIndex
                ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                : i < stepIndex
                ? "text-zinc-400"
                : "text-zinc-700"
            }`}>
              {i < stepIndex ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                  i === stepIndex ? "bg-indigo-500 text-white" : "bg-zinc-800 text-zinc-600"
                }`}>{i + 1}</span>
              )}
              {s}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-6 mx-1 ${i < stepIndex ? "bg-zinc-600" : "bg-zinc-800"}`} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      {/* Goal entry */}
      {step === "goal" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">What&apos;s your goal?</h2>
          <p className="text-sm text-zinc-500 mb-5">
            Be specific. &quot;Run a 5K in 28 minutes&quot; beats &quot;get fit.&quot;
          </p>
          <form onSubmit={handleGoalSubmit} className="space-y-4">
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Learn conversational Spanish for a trip in 8 weeks…"
              rows={4}
              className="input resize-none"
              autoFocus
            />
            <button type="submit" disabled={loading || !goal.trim()} className="btn-primary w-full">
              {loading ? <><LoadingSpinner size="sm" /> Getting questions…</> : "Continue →"}
            </button>
          </form>
        </div>
      )}

      {/* Clarifying questions */}
      {step === "questions" && questions.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          {/* Previous answers */}
          {currentQIndex > 0 && (
            <div className="mb-5 space-y-3 pb-5 border-b border-zinc-800">
              {questions.slice(0, currentQIndex).map((q, i) => (
                <div key={i}>
                  <p className="text-xs font-medium text-zinc-500">{q}</p>
                  <p className="text-sm text-zinc-300 mt-0.5">{answers[i] || <span className="text-zinc-600 italic">skipped</span>}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mb-5">
            <span className="text-xs text-indigo-400 font-medium uppercase tracking-wider">
              Question {currentQIndex + 1} of {questions.length}
            </span>
            <h2 className="text-base font-semibold text-white mt-1">{questions[currentQIndex]}</h2>
          </div>

          <form onSubmit={handleAnswerSubmit} className="space-y-3">
            <textarea
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              placeholder="Your answer…"
              rows={3}
              className="input resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1">
                {currentQIndex < questions.length - 1 ? "Next →" : "Generate plan"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const newAnswers = [...answers];
                  newAnswers[currentQIndex] = "";
                  setAnswers(newAnswers);
                  setCurrentAnswer("");
                  if (currentQIndex < questions.length - 1) {
                    setCurrentQIndex(currentQIndex + 1);
                  } else {
                    generatePlan(newAnswers);
                  }
                }}
                className="btn-ghost text-sm"
              >
                Skip
              </button>
            </div>
          </form>

          <button
            onClick={() => generatePlan(new Array(questions.length).fill(""))}
            className="mt-3 w-full text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-1"
          >
            Skip all and generate now
          </button>
        </div>
      )}

      {/* Generating */}
      {step === "generating" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 flex flex-col items-center justify-center text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-sm font-medium text-white">Building your plan…</p>
          <p className="text-xs text-zinc-500 mt-1">This takes a few seconds</p>
        </div>
      )}

      {/* Goal pill */}
      {step !== "goal" && goal && (
        <div className="flex items-start gap-2 bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-3">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
          <p className="text-sm text-zinc-400">{goal}</p>
        </div>
      )}
    </div>
  );
}
