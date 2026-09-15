/**
 * Per-model list prices, USD per million tokens, Anthropic first-party API.
 *
 * Kept as data so a price change is a one-line edit and so the usage page can
 * show what a call *would* have cost on a different model. Cache reads are
 * billed at 0.1× the input price and cache writes (5-minute TTL) at 1.25×,
 * which is the same ratio across these models.
 *
 * Prices as of 2026-09. Unknown models fall back to Opus pricing so the
 * estimate errs high rather than silently reporting zero.
 */

export interface ModelPrice {
  input: number;
  output: number;
}

export const PRICES: Record<string, ModelPrice> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;
const FALLBACK_PRICE: ModelPrice = PRICES["claude-opus-5"];

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Estimated cost of one call in USD. */
export function estimateCost(model: string, usage: Usage): number {
  const price = PRICES[model] ?? FALLBACK_PRICE;
  const perToken = (usd: number) => usd / 1_000_000;
  return (
    usage.inputTokens * perToken(price.input) +
    usage.outputTokens * perToken(price.output) +
    usage.cacheReadTokens * perToken(price.input) * CACHE_READ_MULTIPLIER +
    usage.cacheWriteTokens * perToken(price.input) * CACHE_WRITE_MULTIPLIER
  );
}

/** "$0.0123" for small numbers, "$1.23" for larger. */
export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
