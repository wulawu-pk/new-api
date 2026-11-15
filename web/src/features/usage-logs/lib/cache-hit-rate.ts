/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { LogOtherData } from '../types'

// ----------------------------------------------------------------------------
// Prompt-cache hit rate of one request (peroai fork)
// ----------------------------------------------------------------------------
// The two usage shapes count input differently, so the rate must follow the
// log's usage semantic:
// - OpenAI-shaped usage (chat/completions, responses): prompt_tokens already
//   includes cached tokens, so hit rate = cache read / prompt.
// - Anthropic-shaped usage (usage_semantic "anthropic"): input_tokens excludes
//   cache reads and cache writes, so the whole prompt is
//   input + cache read + cache write, and hit rate = cache read / that sum.
// Dividing a Claude cache read by prompt_tokens alone gives nonsense (a prompt
// of 4 tokens with 14,536 cached).

export type CacheHitRateInput = {
  promptTokens: number
  other: LogOtherData | null | undefined
}

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0
}

/** Cache writes of a log, preferring the 5m/1h split when it is present. */
export function cacheWriteTokens(
  other: LogOtherData | null | undefined
): number {
  const split =
    tokenCount(other?.cache_creation_tokens_5m) +
    tokenCount(other?.cache_creation_tokens_1h)
  return split > 0 ? split : tokenCount(other?.cache_creation_tokens)
}

/**
 * Share of the prompt served from cache, between 0 and 1. Null when the
 * request reported no cache activity at all (no read and no write), because a
 * 0% there would be indistinguishable from "this upstream reports no cache".
 */
export function getCacheHitRate(input: CacheHitRateInput): number | null {
  const { other } = input
  const read = tokenCount(other?.cache_tokens)
  const write = cacheWriteTokens(other)
  if (read === 0 && write === 0) return null
  const prompt = tokenCount(input.promptTokens)
  const total =
    other?.usage_semantic === 'anthropic' ? prompt + read + write : prompt
  if (total <= 0) return null
  return Math.min(read / total, 1)
}

/**
 * Percentage text such as `72.2%`. Rounded down to one decimal so a request
 * that missed even a few tokens never reads as 100%.
 */
export function formatCacheHitRate(rate: number): string {
  const pct = Math.floor(rate * 1000) / 10
  return `${Number(pct.toFixed(1))}%`
}
