"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useAssistant } from "./AssistantProvider";

/**
 * The only chrome the app has. A wordmark, two destinations, and the primary
 * action. Goals are reached from the week page rather than a persistent list,
 * so the calendar gets the full width.
 */
export default function TopBar({ userName, isAdmin }: { userName: string | null | undefined; isAdmin: boolean }) {
  const pathname = usePathname();
  const { toggle, open } = useAssistant();
  const onWeek = pathname === "/dashboard" || pathname.startsWith("/goals/");
  const onAvailability = pathname.startsWith("/settings");
  const onAdmin = pathname.startsWith("/admin");

  const navClass = (active: boolean) =>
    `text-[14px] transition-colors ${active ? "text-ink" : "text-ink-3 hover:text-ink"}`;

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex h-[56px] max-w-[1160px] items-center gap-7 px-8">
        <Link href="/dashboard" className="display text-[22px] leading-none">
          Goal Planner
        </Link>
        <nav className="flex items-center gap-5">
          <Link href="/dashboard" className={navClass(onWeek)}>Week</Link>
          <Link href="/settings/availability" className={navClass(onAvailability)}>Availability</Link>
          {isAdmin && <Link href="/admin/usage" className={navClass(onAdmin)}>Usage</Link>}
        </nav>
        <div className="flex-1" />
        <button
          onClick={toggle}
          aria-pressed={open}
          className="inline-flex items-center gap-2 rounded border border-rule-2 px-[13px] py-[7px] text-[13.5px] font-medium text-ink transition-colors hover:bg-paper-2"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M8 2 L9.4 6.6 L14 8 L9.4 9.4 L8 14 L6.6 9.4 L2 8 L6.6 6.6 Z" strokeLinejoin="round" />
          </svg>
          Planner
          <span className="hidden text-[11px] text-ink-4 sm:inline">⌘K</span>
        </button>
        <Link href="/goals/new" className="btn">New goal</Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-[13px] text-ink-3 transition-colors hover:text-ink"
          title={userName ?? undefined}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
