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
import { LOG_TYPE_ENUM } from '@/features/usage-logs/constants'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import {
  cacheWriteTokens,
  getCacheHitRate,
} from '@/features/usage-logs/lib/cache-hit-rate'
import {
  getCreditBillingSummary,
  type CreditBillingSummary,
} from '@/features/usage-logs/lib/credit-billing'
import { parseLogOther } from '@/features/usage-logs/lib/format'
import { readTierPrices } from '@/features/usage-logs/lib/tier-prices'
import type { LogOtherData, LogTierPrices } from '@/features/usage-logs/types'

import { getLogBilling, type LogBilling } from './billing-kind'

/** Display facts of one request log for the console tables. */
export type ConsoleLogRow = {
  id: number
  createdAt: number
  /** Owner of the request; shown in the admin all-users view. */
  username: string
  /** Channel that served it (admin view only; 0 when unknown). */
  channel: number
  channelName: string
  tokenName: string
  model: string
  group: string
  input: number
  output: number
  cacheRead: number
  /** Tokens written to the prompt cache (5m + 1h when split). */
  cacheWrite: number
  /** 0–1, or null when the request reported no cache activity. */
  cacheHit: number | null
  /** Total time in seconds. */
  useTime: number
  /** Time to first token in seconds, when recorded. */
  firstToken: number | null
  quota: number
  isError: boolean
  /** Error reason for failed requests. */
  content: string
  credit: CreditBillingSummary | null
  tierPrices: LogTierPrices | null
  groupRatio: number | null
  /** Billing basis when not credit-billed: per image, second, request or token. */
  billing: LogBilling
  isStream: boolean
  /** Request path the client called (e.g. /v1/messages); '' when unknown. */
  endpoint: string
  other: LogOtherData | null
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function toConsoleLogRow(log: UsageLog): ConsoleLogRow {
  const other = parseLogOther(log.other)
  const frtMs = finite(other?.frt)
  const userRatio = finite(other?.user_group_ratio)
  const groupRatio =
    userRatio != null && userRatio !== -1
      ? userRatio
      : finite(other?.group_ratio)
  const tierPrices = readTierPrices(other)
  return {
    id: log.id,
    createdAt: log.created_at,
    username: log.username ?? '',
    channel: log.channel ?? 0,
    channelName: log.channel_name ?? '',
    tokenName: log.token_name,
    model: log.model_name,
    group: log.group,
    input: log.prompt_tokens,
    output: log.completion_tokens,
    cacheRead: Math.max(0, finite(other?.cache_tokens) ?? 0),
    cacheWrite: cacheWriteTokens(other),
    cacheHit: getCacheHitRate({ promptTokens: log.prompt_tokens, other }),
    useTime: log.use_time,
    firstToken: frtMs != null && frtMs > 0 ? frtMs / 1000 : null,
    quota: log.quota,
    isError: log.type === LOG_TYPE_ENUM.ERROR,
    content: log.content,
    credit: getCreditBillingSummary(other, log.quota),
    tierPrices,
    groupRatio,
    billing: getLogBilling(other, tierPrices, groupRatio),
    isStream: log.is_stream,
    endpoint: typeof other?.request_path === 'string' ? other.request_path : '',
    other,
  }
}

/** Compact token count: 8210 → 8.2K, 1500000 → 1.5M. */
export function compactTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`
}
