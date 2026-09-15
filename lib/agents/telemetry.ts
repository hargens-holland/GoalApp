import { prisma } from "@/lib/prisma";
import { estimateCost, type Usage } from "./pricing";

/**
 * Persist one record per agent call.
 *
 * The guiding rule matches client.ts: **this must never affect the call it
 * describes.** Recording is fire-and-forget, every error is swallowed to a
 * warning, and the write is skipped entirely under the test runner so unit
 * tests never touch a database. If telemetry is down, planning still works;
 * we just lose a row.
 */

export interface AgentCallRecord extends Usage {
  label: string;
  model: string;
  source: "llm" | "fallback";
  reason?: string;
  attempts: number;
  latencyMs: number;
  userId?: string;
}

function isDisabled(): boolean {
  return (
    process.env.VITEST === "true" ||
    process.env.NODE_ENV === "test" ||
    // Eval runs and one-off scripts set this so their calls don't land in the
    // product's usage numbers.
    process.env.AGENT_TELEMETRY === "off"
  );
}

export function recordAgentCall(record: AgentCallRecord): void {
  if (isDisabled()) return;

  const costUsd = record.source === "llm" ? estimateCost(record.model, record) : 0;

  void prisma.agentCall
    .create({
      data: {
        label: record.label,
        model: record.model,
        source: record.source,
        reason: record.reason ?? null,
        attempts: record.attempts,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cacheReadTokens: record.cacheReadTokens,
        cacheWriteTokens: record.cacheWriteTokens,
        latencyMs: record.latencyMs,
        costUsd,
        userId: record.userId ?? null,
      },
    })
    .catch((error: unknown) => {
      console.warn(
        `[telemetry] failed to record ${record.label}:`,
        error instanceof Error ? error.message : error
      );
    });
}
