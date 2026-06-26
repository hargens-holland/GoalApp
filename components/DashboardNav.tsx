"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";

export default function DashboardNav({ userName }: { userName: string | null | undefined }) {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-white">Goal Planner</span>
        </Link>

        <div className="flex items-center gap-3">
          {userName && (
            <span className="text-xs text-zinc-500 hidden sm:block">{userName}</span>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="btn-ghost text-xs"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
