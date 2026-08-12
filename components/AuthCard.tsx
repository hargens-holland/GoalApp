"use client";

import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AuthCard({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const isSignup = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isSignup) {
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setError(data.error ?? "Something went wrong");
          setLoading(false);
          return;
        }
      }
      const result = await signIn("credentials", { email, password, redirect: false });
      setLoading(false);
      if (result?.error) {
        setError(isSignup ? "Account created — try signing in" : "Invalid email or password");
        if (isSignup) router.push("/login");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  const tab = (active: boolean) =>
    `flex-1 rounded-[8px] py-2 text-[13px] font-semibold transition-colors ${
      active ? "bg-elevated text-white" : "text-ink-2 hover:text-ink"
    }`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-7 flex items-center gap-[11px]">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-primary">
          <div className="h-3 w-3 rotate-45 rounded-[3px] border-[2.5px] border-white" />
        </div>
        <span className="text-[19px] font-bold tracking-[-0.01em]">Goal Planner</span>
      </div>

      <div className="w-full max-w-[400px] rounded-[18px] border border-[rgba(255,255,255,0.07)] bg-[#121217] p-[26px]">
        <div className="mb-[22px] flex gap-1 rounded-[11px] border border-[rgba(255,255,255,0.06)] bg-[#0b0b0e] p-1">
          <Link href="/login" className={tab(!isSignup)}>Sign in</Link>
          <Link href="/signup" className={tab(isSignup)}>Sign up</Link>
        </div>

        <div className="mb-1 text-[20px] font-bold tracking-[-0.01em]">{isSignup ? "Create your account" : "Welcome back"}</div>
        <div className="mb-5 text-[13.5px] text-ink-3">Plan goals into a roadmap and a daily schedule.</div>

        {error && <div className="mb-4 rounded-[10px] border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-400">{error}</div>}

        <form onSubmit={submit}>
          {isSignup && (
            <>
              <div className="label">Name</div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Rivera" autoComplete="name" className="field mb-[14px]" />
            </>
          )}
          <div className="label">Email</div>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="field mb-[14px]" />
          <div className="label">Password</div>
          <input type="password" required minLength={isSignup ? 6 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={isSignup ? "new-password" : "current-password"} className="field mb-5" />
          <button type="submit" disabled={loading} className="w-full rounded-[11px] bg-primary py-3 text-[14.5px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-40">
            {loading ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>

      <div className="mt-[18px] text-[12.5px] text-ink-4">
        Demo — <span className="font-mono">demo@example.com</span> / <span className="font-mono">demo123</span>
      </div>
    </div>
  );
}
