"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { goalColor } from "@/lib/colors";

interface NavGoal {
  id: string;
  title: string;
}

const LogoMark = () => (
  <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-primary">
    <div className="h-[11px] w-[11px] rotate-45 rounded-[3px] border-[2.5px] border-white" />
  </div>
);

const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" />
  </svg>
);

const NavLink = ({ href, active, icon, label }: { href: string; active: boolean; icon: React.ReactNode; label: string }) => (
  <Link
    href={href}
    className={`flex items-center gap-[11px] rounded-[9px] px-[11px] py-[9px] text-[14px] font-medium transition-colors ${
      active ? "bg-[rgba(255,255,255,0.07)] text-ink" : "text-ink-2 hover:bg-[rgba(255,255,255,0.05)]"
    }`}
  >
    {icon}
    {label}
  </Link>
);

export default function Sidebar({ goals, userName }: { goals: NavGoal[]; userName: string | null | undefined }) {
  const pathname = usePathname();
  const router = useRouter();
  const initial = (userName?.trim()?.[0] ?? "U").toUpperCase();

  return (
    <aside className="sticky top-0 flex h-screen w-[248px] flex-shrink-0 flex-col overflow-y-auto border-r border-[rgba(255,255,255,0.06)] bg-sidebar p-[20px_14px]">
      <div className="flex items-center gap-[10px] px-[6px] pb-[18px] pt-[4px]">
        <LogoMark />
        <span className="text-[16px] font-bold tracking-[-0.01em]">Goal Planner</span>
      </div>

      <button
        onClick={() => router.push("/goals/new")}
        className="mb-[18px] flex w-full items-center gap-[9px] rounded-[10px] bg-primary px-3 py-[10px] text-[14px] font-semibold text-white transition-colors hover:bg-primary-hover"
      >
        <PlusIcon /> New goal
      </button>

      <nav className="flex flex-col gap-[2px]">
        <NavLink href="/dashboard" active={pathname === "/dashboard"} label="Dashboard"
          icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.6" /><rect x="9" y="1" width="6" height="6" rx="1.6" /><rect x="1" y="9" width="6" height="6" rx="1.6" /><rect x="9" y="9" width="6" height="6" rx="1.6" /></svg>} />
        <NavLink href="/schedule" active={pathname === "/schedule"} label="Calendar"
          icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="1.5" y="2.5" width="13" height="12" rx="2" /><line x1="1.5" y1="6" x2="14.5" y2="6" /><line x1="5" y1="1" x2="5" y2="3.6" /><line x1="11" y1="1" x2="11" y2="3.6" /></svg>} />
        <NavLink href="/settings/availability" active={pathname.startsWith("/settings")} label="Availability"
          icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="8" cy="8" r="6.4" /><path d="M8 4.6 V8 L10.4 9.4" strokeLinecap="round" /></svg>} />
      </nav>

      <div className="px-[11px] pb-[8px] pt-[18px] text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">Goals</div>
      <div className="flex flex-col gap-px">
        {goals.map((g) => {
          const active = pathname === `/goals/${g.id}`;
          return (
            <Link
              key={g.id}
              href={`/goals/${g.id}`}
              className={`flex items-center gap-[10px] rounded-[8px] px-[11px] py-[8px] transition-colors ${
                active ? "bg-[rgba(255,255,255,0.06)]" : "hover:bg-[rgba(255,255,255,0.04)]"
              }`}
            >
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: goalColor(g.id) }} />
              <span className="truncate text-[13.5px] font-medium text-ink-2">{g.title}</span>
            </Link>
          );
        })}
      </div>

      <div className="flex-1" />

      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex w-full items-center gap-[10px] rounded-[9px] px-[11px] py-[9px] text-[13.5px] font-medium text-ink-3 transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-ink-2"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">{initial}</span>
        Sign out
      </button>
    </aside>
  );
}
