"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Intent } from "@/lib/agents/schemas";
import { LIMITS } from "@/lib/validation";
import { useAssistant } from "./AssistantProvider";
import { useToast } from "./Toast";

/**
 * The planner chat.
 *
 * A drawer on the right with a transcript, available on every page. Each
 * message you send goes to the Coordinator with the last few turns for
 * context; what comes back is either an answer, a clarifying question, or a
 * proposal card — what was understood, the concrete effects, and a "Do it"
 * button. Nothing is written until that button. Applying refreshes whatever
 * page is behind the panel.
 *
 * The transcript lives in sessionStorage so a reload doesn't lose it; it is a
 * per-tab convenience, not state the server knows about.
 */

interface Proposal {
  intent: Intent;
  summary: string;
  effects: string[];
  actionable: boolean;
  callsModel: boolean;
  source: "llm" | "fallback";
}

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  proposal?: Proposal;
  /** Set once a proposal has been applied or dismissed. */
  resolved?: "applied" | "dismissed";
  result?: string;
}

const SUGGESTIONS = [
  "can't do today, reschedule",
  "pause the guitar this week",
  "how am I doing on Spanish?",
  "I have half the time I thought for the marathon",
];

const STORAGE_KEY = "goal-planner:chat";
const HISTORY_TURNS = 8;

function loadTranscript(): Message[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch {
    return [];
  }
}

function saveTranscript(messages: Message[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
  } catch {
    // Storage unavailable — the transcript just won't survive a reload.
  }
}

export default function ChatPanel() {
  const { open, setOpen } = useAssistant();
  const router = useRouter();
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"thinking" | "applying" | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadTranscript());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveTranscript(messages);
  }, [messages, hydrated]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [open, messages.length]);

  function push(m: Omit<Message, "id">) {
    const msg = { ...m, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    setMessages((prev) => [...prev, msg]);
    return msg.id;
  }

  function update(id: string, patch: Partial<Message>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function send(text: string) {
    const message = text.trim();
    if (message.length < 2 || busy) return;
    setDraft("");
    push({ role: "user", text: message });
    setBusy("thinking");

    // What the model sees: the last few turns, as plain text.
    const history = messages
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, content: m.role === "assistant" && m.result ? `${m.text} ${m.result}` : m.text }));

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      const proposal = data as Proposal;
      push({ role: "assistant", text: proposal.summary, proposal: proposal.actionable ? proposal : undefined });
    } catch (e) {
      push({ role: "assistant", text: e instanceof Error ? e.message : "Something went wrong — try again." });
    } finally {
      setBusy(null);
    }
  }

  async function confirm(m: Message) {
    if (!m.proposal || busy) return;
    setBusy("applying");
    try {
      const res = await fetch("/api/assistant/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: m.proposal.intent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't apply that");
      update(m.id, { resolved: "applied", result: data.summary });
      toast(data.summary);
      // Whatever page is behind the panel re-renders with the new state.
      router.refresh();
    } catch (e) {
      push({ role: "assistant", text: e instanceof Error ? e.message : "Couldn't apply that." });
    } finally {
      setBusy(null);
    }
  }

  function dismiss(m: Message) {
    update(m.id, { resolved: "dismissed" });
  }

  function clear() {
    setMessages([]);
  }

  return (
    <>
      {/* Scrim */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-ink/10 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Planner"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-rule bg-paper transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex h-[56px] flex-shrink-0 items-center gap-3 border-b border-rule px-5">
          <span className="text-[15px] font-medium text-ink">Planner</span>
          <span className="text-[12px] text-ink-4">⌘K</span>
          <div className="flex-1" />
          {messages.length > 0 && (
            <button onClick={clear} className="text-[12.5px] text-ink-3 hover:text-ink">Clear</button>
          )}
          <button onClick={() => setOpen(false)} aria-label="Close" className="text-ink-3 hover:text-ink">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 4 L12 12 M12 4 L4 12" /></svg>
          </button>
        </header>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {messages.length === 0 ? (
            <div>
              <p className="text-[15px] leading-[1.55] text-ink-2">
                Tell me what changed and I&apos;ll show you what I&apos;d do before doing it. Skip a day, pause a
                goal, revise a roadmap, or ask how something is going.
              </p>
              <div className="mt-5 flex flex-col items-start gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded border border-rule-2 px-3 py-[6px] text-left text-[13.5px] text-ink-2 hover:border-ink hover:text-ink">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded bg-ink px-3 py-2 text-[14px] leading-[1.5] text-paper">{m.text}</div>
                  </div>
                ) : (
                  <div key={m.id} className="max-w-[95%]">
                    <p className="text-[14.5px] leading-[1.5] text-ink">{m.text}</p>
                    {m.proposal && (
                      <div className="mt-2 border-l-2 border-ink pl-3">
                        <ul className="space-y-1 text-[13px] leading-[1.5] text-ink-2">
                          {m.proposal.effects.map((e, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-ink-4">→</span>
                              <span>{e}</span>
                            </li>
                          ))}
                        </ul>
                        {m.resolved === "applied" ? (
                          <p className="mt-2 text-[13px] text-ink-2">
                            <span className="font-medium text-ink">Done.</span> {m.result}
                          </p>
                        ) : m.resolved === "dismissed" ? (
                          <p className="mt-2 text-[12.5px] text-ink-4">Not applied.</p>
                        ) : (
                          <div className="mt-3 flex items-center gap-3">
                            <button onClick={() => confirm(m)} disabled={busy !== null} className="btn py-[6px]">
                              {busy === "applying" ? (m.proposal.callsModel ? "Working…" : "Applying…") : "Do it"}
                            </button>
                            <button onClick={() => dismiss(m)} disabled={busy !== null} className="btn-text">Never mind</button>
                          </div>
                        )}
                        {m.proposal.source === "fallback" && !m.resolved && (
                          <p className="mt-2 text-[11.5px] text-ink-4">Understood without a model — keyword matching.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
              {busy === "thinking" && <p className="text-[13.5px] text-ink-4">Thinking…</p>}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="flex-shrink-0 border-t border-rule px-5 py-4"
        >
          <div className="flex items-center gap-2 border-b border-rule-2 pb-2 focus-within:border-ink">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={LIMITS.assistantMessage}
              placeholder="Tell the planner something…"
              aria-label="Message the planner"
              className="flex-1 bg-transparent py-1 text-[14.5px] text-ink outline-none placeholder:text-ink-4"
              disabled={busy !== null}
            />
            <button type="submit" disabled={draft.trim().length < 2 || busy !== null} className="btn-text disabled:opacity-40">
              Send
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-ink-4">Nothing changes until you confirm a proposal.</p>
        </form>
      </aside>
    </>
  );
}
