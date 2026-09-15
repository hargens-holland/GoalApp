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
  const [demoLoading, setDemoLoading] = useState(false);

  // The public deployment runs in demo mode and ships a seeded account, so it
  // offers a one-click sign-in. Self-hosted instances with a real API key leave
  // NEXT_PUBLIC_DEMO_MODE unset and get the normal login form only.
  const showDemoLogin = !isSignup && process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  async function signInAsDemo() {
    setError("");
    setDemoLoading(true);
    const result = await signIn("credentials", {
      email: "demo@example.com",
      password: "demo123",
      redirect: false,
    });
    if (result?.error) {
      setError("The demo account isn't available — has the database been seeded?");
      setDemoLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

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
        setError(isSignup ? "Account created — try signing in" : "That email and password don't match");
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

  return (
    <div className="mx-auto flex min-h-screen max-w-[1160px] flex-col px-8">
      <header className="flex h-[56px] items-center">
        <span className="display text-[22px] leading-none">Goal Planner</span>
      </header>

      <div className="grid flex-1 grid-cols-1 items-center gap-16 py-16 lg:grid-cols-[1.2fr_1fr]">
        {/* Pitch */}
        <div>
          <h1 className="display text-[56px] leading-[1.02]">
            A goal becomes a roadmap.
            <br />
            The roadmap becomes <em>this week</em>.
          </h1>
          <p className="mt-6 max-w-[520px] text-[17px] leading-[1.55] text-ink-2">
            State what you want to achieve. It&apos;s broken into milestones, and each week the next
            concrete steps are placed into the hours you&apos;re actually free — then re-planned when
            life moves things around.
          </p>
        </div>

        {/* Form */}
        <div className="w-full max-w-[380px] lg:ml-auto">
          <div className="flex gap-5 border-b border-rule text-[14px]">
            <Link href="/login" className={`-mb-px border-b pb-3 ${!isSignup ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}>Sign in</Link>
            <Link href="/signup" className={`-mb-px border-b pb-3 ${isSignup ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}>Create account</Link>
          </div>

          {error && <p className="mt-5 text-[13.5px] text-danger">{error}</p>}

          {showDemoLogin && (
            <div className="mt-6">
              <button type="button" onClick={signInAsDemo} disabled={demoLoading || loading} className="btn w-full py-[10px]">
                {demoLoading ? "Signing in…" : "Look around the demo"}
              </button>
              <p className="mt-2 text-center text-[12.5px] text-ink-3">
                A populated account — four goals, a few weeks of history. No signup.
              </p>
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-rule" />
                <span className="text-[11px] uppercase tracking-[0.08em] text-ink-4">or</span>
                <div className="h-px flex-1 bg-rule" />
              </div>
            </div>
          )}

          <form onSubmit={submit} className={showDemoLogin ? "" : "mt-6"}>
            {isSignup && (
              <>
                <label className="label" htmlFor="name">Name</label>
                <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="field mb-4" />
              </>
            )}
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="field mb-4" />
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" required minLength={isSignup ? 6 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isSignup ? "new-password" : "current-password"} className="field mb-5" />
            <button type="submit" disabled={loading} className={`${showDemoLogin ? "btn-ghost" : "btn"} w-full py-[10px]`}>
              {loading ? "One moment…" : isSignup ? "Create account" : "Sign in"}
            </button>
          </form>

          {showDemoLogin && (
            <p className="mt-4 text-[12.5px] text-ink-4">
              Or sign in as <span className="font-mono">demo@example.com</span> / <span className="font-mono">demo123</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
