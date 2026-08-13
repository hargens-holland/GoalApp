import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/**
 * The single entry point through which every agent talks to the Anthropic API.
 *
 * The guiding rule is that **this function never throws**. Planning is a
 * best-effort enhancement layered on top of an app that must keep working, so
 * every failure mode — no API key, rate limit, timeout, truncated generation,
 * malformed output, refusal — resolves to the caller's deterministic fallback
 * rather than a 500. Callers get back a value plus a record of where it came
 * from, so the failure is visible in logs and to the UI without being fatal.
 *
 * See docs/ARCHITECTURE.md ("Failure handling") for the full matrix.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Model used for every agent call. Structured outputs require Opus 4.5+. */
export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

/**
 * Per-request ceiling. Roadmap and schedule generation are genuinely slow
 * (thousands of output tokens), so this is generous — but it is set explicitly
 * rather than left at the SDK's 10-minute default, because a request that hangs
 * for ten minutes on a serverless host is indistinguishable from an outage and
 * will be killed by the platform first anyway.
 */
const REQUEST_TIMEOUT_MS = 90_000;

/**
 * Retries for *transport* failures (429, 5xx, connection resets).
 *
 * Delegated to the SDK rather than hand-rolled: it already implements
 * exponential backoff with jitter and honours the `retry-after` header, and
 * reimplementing that badly is worse than not reimplementing it. Set explicitly
 * (the default is also 2) so the policy is stated in the codebase rather than
 * inherited invisibly.
 */
const TRANSPORT_RETRIES = 2;

/**
 * Retries for *semantic* failures — output that arrived intact but did not
 * satisfy the schema, or generation that ran past `max_tokens` mid-object.
 * The SDK cannot know about these, so they are handled here. One retry: if a
 * constrained model produces unusable output twice, a third attempt is unlikely
 * to differ and the user is better served by an immediate fallback.
 */
const VALIDATION_RETRIES = 1;

// ---------------------------------------------------------------------------
// Demo mode
// ---------------------------------------------------------------------------

/**
 * True when the app must not make paid API calls.
 *
 * The public demo runs with `DEMO_MODE=true` so that a shared, unauthenticated
 * deployment can never spend real credits or be used as a free proxy to the
 * Anthropic API. Demo mode is not a degraded state: every agent has a
 * deterministic planner that produces a complete, coherent result, so the whole
 * product is exercisable without a key.
 */
export function isDemoMode(): boolean {
  return (
    process.env.DEMO_MODE === "true" || !process.env.ANTHROPIC_API_KEY?.trim()
  );
}

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: TRANSPORT_RETRIES,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }
  return cachedClient;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Why a call fell back to deterministic planning. */
export type FallbackReason =
  /** No API key configured, or DEMO_MODE is on. Expected, not an error. */
  | "demo_mode"
  /** Output failed schema validation, or was cut off by the token limit. */
  | "invalid_output"
  /** Rate limited, and the transport retries did not clear it. */
  | "rate_limited"
  /** Anthropic returned 5xx / 529 after retries. */
  | "service_unavailable"
  /** Request exceeded REQUEST_TIMEOUT_MS. */
  | "timeout"
  /** Network failure before a response was received. */
  | "connection_error"
  /** Bad API key, revoked credentials, or insufficient permissions. */
  | "auth_error"
  /** The model declined the request on safety grounds. */
  | "refused"
  /** Anything not covered above. */
  | "unknown_error";

export type AgentOutcome<T> = {
  data: T;
  /** Whether `data` came from the model or from deterministic planning. */
  source: "llm" | "fallback";
  /** Present only when `source` is "fallback". */
  reason?: FallbackReason;
  /** Model attempts made (0 in demo mode). */
  attempts: number;
};

/** Map a thrown SDK error to a typed reason. Order matters: subclasses first. */
function classifyError(error: unknown): FallbackReason {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (error instanceof Anthropic.RateLimitError) return "rate_limited";
  if (error instanceof Anthropic.AuthenticationError) return "auth_error";
  if (error instanceof Anthropic.PermissionDeniedError) return "auth_error";
  if (error instanceof Anthropic.InternalServerError) return "service_unavailable";
  if (error instanceof Anthropic.APIConnectionError) return "connection_error";
  if (error instanceof Anthropic.APIError) {
    return error.status && error.status >= 500
      ? "service_unavailable"
      : "unknown_error";
  }
  return "unknown_error";
}

/**
 * Structured log line for every agent call.
 *
 * Without this there is no way to tell from the outside whether a plan was
 * generated or fabricated by the fallback — the two produce identical-looking
 * results in the database.
 */
function logOutcome(label: string, outcome: AgentOutcome<unknown>): void {
  const detail =
    outcome.source === "llm"
      ? `source=llm attempts=${outcome.attempts}`
      : `source=fallback reason=${outcome.reason} attempts=${outcome.attempts}`;
  // Demo mode is the normal operating state of the public deployment, so it
  // logs at info; a genuine failure is a warning worth alerting on.
  const level =
    outcome.source === "llm" || outcome.reason === "demo_mode" ? "info" : "warn";
  console[level === "info" ? "log" : "warn"](`[agent:${label}] ${detail}`);
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

export interface GenerateOptions<T> {
  /** Short identifier used in logs, e.g. "architect.roadmap". */
  label: string;
  /** The fully-rendered user prompt. */
  prompt: string;
  /** Schema the response is constrained to and validated against. */
  schema: z.ZodType<T>;
  /** Output token ceiling for this call. */
  maxTokens: number;
  /**
   * Deterministic planner used when the model cannot be reached or cannot
   * produce valid output. Must always return a usable value.
   */
  fallback: () => T;
}

/**
 * Ask the model for a value conforming to `schema`, falling back to
 * deterministic planning on any failure.
 */
export async function generate<T>({
  label,
  prompt,
  schema,
  maxTokens,
  fallback,
}: GenerateOptions<T>): Promise<AgentOutcome<T>> {
  if (isDemoMode()) {
    const outcome: AgentOutcome<T> = {
      data: fallback(),
      source: "fallback",
      reason: "demo_mode",
      attempts: 0,
    };
    logOutcome(label, outcome);
    return outcome;
  }

  let attempts = 0;
  let reason: FallbackReason = "unknown_error";

  for (let attempt = 0; attempt <= VALIDATION_RETRIES; attempt++) {
    attempts++;
    try {
      const message = await getClient().messages.parse({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        // Constrains generation to the schema rather than merely requesting it.
        output_config: { format: zodOutputFormat(schema) },
      });

      // The model declined on safety grounds. Retrying an identical prompt
      // will not change that, so fall back immediately.
      if (message.stop_reason === "refusal") {
        reason = "refused";
        break;
      }

      // Generation hit the token ceiling mid-object, so the JSON is incomplete.
      // Worth one more attempt — output length varies between runs.
      if (message.stop_reason === "max_tokens") {
        reason = "invalid_output";
        console.warn(
          `[agent:${label}] hit max_tokens (${maxTokens}); output truncated`
        );
        continue;
      }

      // `parsed_output` is null when the payload did not satisfy the schema,
      // including the client-side constraints the API cannot enforce.
      if (message.parsed_output == null) {
        reason = "invalid_output";
        continue;
      }

      const outcome: AgentOutcome<T> = {
        data: message.parsed_output,
        source: "llm",
        attempts,
      };
      logOutcome(label, outcome);
      return outcome;
    } catch (error) {
      reason = classifyError(error);
      console.warn(
        `[agent:${label}] call failed: reason=${reason}`,
        error instanceof Error ? error.message : error
      );
      // Transport failures have already been retried by the SDK with backoff,
      // and auth/refusal errors are not transient — no value in looping again.
      break;
    }
  }

  const outcome: AgentOutcome<T> = {
    data: fallback(),
    source: "fallback",
    reason,
    attempts,
  };
  logOutcome(label, outcome);
  return outcome;
}
