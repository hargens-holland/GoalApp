"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

/**
 * The only chrome the app has. A wordmark, two destinations, and the primary
 * action. Goals are reached from the week page rather than a persistent list,
 * so the calendar gets the full width.
 */
export default function TopBar({ userName }: { userName: string | null | undefined }) {
  const pathname = usePathname();
  const onWeek = pathname === "/dashboard" || pathname.startsWith("/goals/");
  const onAvailability = pathname.startsWith("/settings");

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
        </nav>
        <div className="flex-1" />
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
