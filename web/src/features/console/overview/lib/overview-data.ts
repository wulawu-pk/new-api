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
import type dayjs from 'dayjs'

import type { QuotaDataItem } from '@/features/dashboard/types'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import { cacheWriteTokens } from '@/features/usage-logs/lib/cache-hit-rate'
import { parseLogOther } from '@/features/usage-logs/lib/format'

export type DaySpend = {
  /** Start of the day, unix seconds. */
  start: number
  quota: number
  count: number
}

/**
 * Buckets hourly quota rows into the last `days` calendar days (oldest first,
 * today last). Rows outside the window are ignored.
 */
export function bucketByDay(
  rows: QuotaDataItem[],
  now: dayjs.Dayjs,
  days = 7
): DaySpend[] {
  const first = now.startOf('day').subtract(days - 1, 'day')
  const out: DaySpend[] = Array.from({ length: days }, (_, i) => ({
    start: first.add(i, 'day').unix(),
    quota: 0,
    count: 0,
  }))
  for (const row of rows) {
    const index = Math.floor((row.created_at - first.unix()) / 86400)
    if (index < 0 || index >= days) continue
    out[index].quota += row.quota ?? 0
    out[index].count += row.count ?? 0
  }
  return out
}

/** Sum of quota and request count of quota rows. */
export function sumUsage(rows: QuotaDataItem[]): {
  quota: number
  count: number
} {
  let quota = 0
  let count = 0
  for (const row of rows) {
    quota += row.quota ?? 0
    count += row.count ?? 0
  }
  return { quota, count }
}

/**
 * Prompt-cache hit rate over several requests, weighted by prompt size and
 * following each log's usage semantic (see cache-hit-rate.ts). Null when no
 * request reported cache activity.
 */
export function averageCacheHitRate(logs: UsageLog[]): number | null {
  let read = 0
  let total = 0
  let any = false
  for (const log of logs) {
    const other = parseLogOther(log.other)
    const cacheRead = Math.max(0, other?.cache_tokens ?? 0)
    const write = cacheWriteTokens(other)
    if (cacheRead > 0 || write > 0) any = true
    const prompt = Math.max(0, log.prompt_tokens)
    read += cacheRead
    total +=
      other?.usage_semantic === 'anthropic'
        ? prompt + cacheRead + write
        : prompt
  }
  if (!any || total <= 0) return null
  return Math.min(read / total, 1)
}

/** Successful share of requests, or null without any request. */
export function availability(ok: number, failed: number): number | null {
  const all = ok + failed
  if (all <= 0) return null
  return ok / all
}

/** Percentage text rounded down to one decimal, e.g. `99.7%`. */
export function formatPercentFloor(rate: number): string {
  return `${Number((Math.floor(rate * 1000) / 10).toFixed(1))}%`
}
