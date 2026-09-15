import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { formatUsd } from "@/lib/agents/pricing";
import { toISODate } from "@/lib/dates";

/**
 * Operational view of the agents over the last 30 days: what ran, what it
 * cost, how often the model was actually used versus the fallback, and how
 * long calls took. Everything is computed from AgentCall rows in one query;
 * at this scale that is simpler and faster than a dozen aggregate queries,
 * and the first thing to change if the table grows past ~100k rows.
 */

const DAYS = 30;

function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)}%` : "–";
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default async function UsagePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (!isAdmin(session.user.email)) notFound();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - DAYS);

  const calls = await prisma.agentCall.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });

  // Totals ---------------------------------------------------------------
  const llm = calls.filter((c) => c.source === "llm");
  const totalCost = llm.reduce((s, c) => s + c.costUsd, 0);
  const totalIn = llm.reduce((s, c) => s + c.inputTokens, 0);
  const totalOut = llm.reduce((s, c) => s + c.outputTokens, 0);
  const totalCacheRead = llm.reduce((s, c) => s + c.cacheReadTokens, 0);
  const latencies = llm.map((c) => c.latencyMs).sort((a, b) => a - b);
  const fallbacks = calls.filter((c) => c.source === "fallback" && c.reason !== "demo_mode");
  const demoCalls = calls.filter((c) => c.reason === "demo_mode").length;

  // By agent -------------------------------------------------------------
  const byLabel = new Map<string, typeof calls>();
  for (const c of calls) byLabel.set(c.label, [...(byLabel.get(c.label) ?? []), c]);
  const agents = Array.from(byLabel.entries())
    .map(([label, rows]) => {
      const live = rows.filter((r) => r.source === "llm");
      const lat = live.map((r) => r.latencyMs).sort((a, b) => a - b);
      return {
        label,
        calls: rows.length,
        live: live.length,
        model: live[0]?.model ?? rows[0]?.model ?? "–",
        cost: live.reduce((s, r) => s + r.costUsd, 0),
        tokensIn: live.reduce((s, r) => s + r.inputTokens, 0),
        tokensOut: live.reduce((s, r) => s + r.outputTokens, 0),
        p50: percentile(lat, 50),
        p95: percentile(lat, 95),
        fallbackRate: rows.length ? rows.filter((r) => r.source === "fallback" && r.reason !== "demo_mode").length / rows.length : 0,
      };
    })
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls);

  // Fallback reasons -----------------------------------------------------
  const reasons = new Map<string, number>();
  for (const c of fallbacks) reasons.set(c.reason ?? "unknown", (reasons.get(c.reason ?? "unknown") ?? 0) + 1);

  // Cost per day ---------------------------------------------------------
  const perDay: { date: string; cost: number; calls: number }[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    perDay.push({ date: toISODate(d), cost: 0, calls: 0 });
  }
  const dayIndex = new Map(perDay.map((d, i) => [d.date, i]));
  for (const c of calls) {
    const i = dayIndex.get(toISODate(c.createdAt));
    if (i == null) continue;
    perDay[i].calls++;
    perDay[i].cost += c.costUsd;
  }
  const maxDayCost = Math.max(0.0001, ...perDay.map((d) => d.cost));

  return (
    <div>
      <div className="eyebrow">Admin · last {DAYS} days</div>
      <h1 className="display mt-1 text-[38px] leading-none">Agent usage</h1>
      <p className="mt-3 max-w-[640px] text-[14.5px] leading-[1.55] text-ink-2">
        Every model call made through <code className="font-mono text-[13px]">generate()</code>, with the
        tokens it used, what it cost at list price, and whether the answer came from the model or the
        deterministic fallback.
      </p>

      {/* Headline ---------------------------------------------------------- */}
      <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-rule pt-6 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Calls" value={String(calls.length)} sub={`${llm.length} model · ${calls.length - llm.length} fallback`} />
        <Stat label="Est. cost" value={formatUsd(totalCost)} sub={llm.length ? `${formatUsd(totalCost / llm.length)} per model call` : "no model calls"} />
        <Stat label="Tokens" value={`${fmtTokens(totalIn)} → ${fmtTokens(totalOut)}`} sub="input → output" />
        <Stat label="Cache hits" value={pct(totalCacheRead, totalIn + totalCacheRead)} sub={`${fmtTokens(totalCacheRead)} tokens read from cache`} />
        <Stat label="Latency" value={llm.length ? `${(percentile(latencies, 50) / 1000).toFixed(1)}s` : "–"} sub={llm.length ? `p95 ${(percentile(latencies, 95) / 1000).toFixed(1)}s` : ""} />
        <Stat
          label="Fallback rate"
          value={pct(fallbacks.length, calls.length - demoCalls)}
          sub={demoCalls ? `excl. ${demoCalls} demo-mode` : "of non-demo calls"}
          warn={calls.length - demoCalls > 0 && fallbacks.length / (calls.length - demoCalls) > 0.05}
        />
      </div>

      {/* Cost per day -------------------------------------------------------- */}
      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="display text-[24px]">Cost per day</h2>
          <span className="font-mono text-[11px] text-ink-4">max {formatUsd(maxDayCost)}</span>
        </div>
        <div className="mt-3 flex h-[64px] items-end gap-[3px] border-b border-rule pb-px">
          {perDay.map((d) => (
            <div
              key={d.date}
              className="flex-1 rounded-sm bg-ink"
              style={{ height: `${Math.max(d.calls ? 2 : 0, (d.cost / maxDayCost) * 64)}px`, opacity: d.cost ? 0.85 : 0.25 }}
              title={`${d.date}: ${d.calls} call${d.calls === 1 ? "" : "s"}, ${formatUsd(d.cost)}`}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10.5px] text-ink-4">
          <span>{perDay[0].date}</span>
          <span>today</span>
        </div>
      </section>

      {/* By agent ------------------------------------------------------------ */}
      <section className="mt-12">
        <h2 className="display text-[24px]">By agent</h2>
        {agents.length === 0 ? (
          <p className="mt-3 text-[14px] text-ink-3">No calls recorded yet. Create a goal or replan a week.</p>
        ) : (
          <table className="mt-3 w-full border-t border-rule text-[13.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-3">
                <Th>Agent</Th><Th>Model</Th><Th num>Calls</Th><Th num>Model %</Th><Th num>Fallback</Th><Th num>In → out</Th><Th num>p50</Th><Th num>p95</Th><Th num>Cost</Th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.label} className="row">
                  <Td><span className="font-mono text-[12.5px]">{a.label}</span></Td>
                  <Td><span className="font-mono text-[12px] text-ink-2">{a.model}</span></Td>
                  <Td num>{a.calls}</Td>
                  <Td num>{pct(a.live, a.calls)}</Td>
                  <Td num><span className={a.fallbackRate > 0.05 ? "text-danger" : ""}>{a.fallbackRate ? `${Math.round(a.fallbackRate * 100)}%` : "–"}</span></Td>
                  <Td num>{a.live ? `${fmtTokens(a.tokensIn)} → ${fmtTokens(a.tokensOut)}` : "–"}</Td>
                  <Td num>{a.live ? `${(a.p50 / 1000).toFixed(1)}s` : "–"}</Td>
                  <Td num>{a.live ? `${(a.p95 / 1000).toFixed(1)}s` : "–"}</Td>
                  <Td num>{formatUsd(a.cost)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Fallback reasons ---------------------------------------------------- */}
      {reasons.size > 0 && (
        <section className="mt-12">
          <h2 className="display text-[24px]">Why calls fell back</h2>
          <div className="mt-3 border-t border-rule">
            {Array.from(reasons.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([reason, n]) => (
                <div key={reason} className="row flex items-baseline justify-between py-[9px] text-[13.5px]">
                  <span className="font-mono text-[12.5px]">{reason}</span>
                  <span className="font-mono text-ink-2">{n}</span>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Recent -------------------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="display text-[24px]">Recent calls</h2>
        <table className="mt-3 w-full border-t border-rule text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-3">
              <Th>When</Th><Th>Agent</Th><Th>Source</Th><Th num>In</Th><Th num>Out</Th><Th num>Cache</Th><Th num>Latency</Th><Th num>Cost</Th>
            </tr>
          </thead>
          <tbody>
            {calls.slice(0, 25).map((c) => (
              <tr key={c.id} className="row">
                <Td><span className="font-mono text-[12px] text-ink-3">{c.createdAt.toISOString().slice(5, 16).replace("T", " ")}</span></Td>
                <Td><span className="font-mono text-[12px]">{c.label}</span></Td>
                <Td>
                  {c.source === "llm" ? (
                    <span className="text-ink">model</span>
                  ) : (
                    <span className={c.reason === "demo_mode" ? "text-ink-3" : "text-danger"}>fallback · {c.reason}</span>
                  )}
                </Td>
                <Td num>{c.source === "llm" ? fmtTokens(c.inputTokens) : "–"}</Td>
                <Td num>{c.source === "llm" ? fmtTokens(c.outputTokens) : "–"}</Td>
                <Td num>{c.cacheReadTokens ? fmtTokens(c.cacheReadTokens) : "–"}</Td>
                <Td num>{(c.latencyMs / 1000).toFixed(1)}s</Td>
                <Td num>{c.source === "llm" ? formatUsd(c.costUsd) : "–"}</Td>
              </tr>
            ))}
            {calls.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-[14px] text-ink-3">Nothing yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`mt-1 font-mono text-[22px] ${warn ? "text-danger" : "text-ink"}`}>{value}</div>
      {sub && <div className="mt-[2px] text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

function Th({ children, num }: { children: React.ReactNode; num?: boolean }) {
  return <th className={`py-2 font-medium ${num ? "text-right" : ""}`}>{children}</th>;
}

function Td({ children, num }: { children: React.ReactNode; num?: boolean }) {
  return <td className={`py-[9px] ${num ? "text-right font-mono text-[12.5px]" : ""}`}>{children}</td>;
}
