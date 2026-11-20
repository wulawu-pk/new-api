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
import type { PerformanceSeriesPoint } from '@/features/performance-metrics/types'

export type StatusSlot = { start: number; rate: number | null }

/** Below this many requests a group's availability is not meaningful. */
export const MIN_REQUESTS_FOR_RATE = 20

/**
 * Splits the window into `count` equal slots and averages the success rate
 * of the points in each; slots without points stay null (no requests).
 */
export function toSlots(
  series: PerformanceSeriesPoint[] | undefined,
  windowStart: number,
  windowEnd: number,
  count = 24
): StatusSlot[] {
  const width = Math.max(1, (windowEnd - windowStart) / count)
  const sums = Array.from({ length: count }, () => ({ total: 0, n: 0 }))
  for (const point of series ?? []) {
    if (!Number.isFinite(point.ts) || !Number.isFinite(point.success_rate)) {
      continue
    }
    const index = Math.floor((point.ts - windowStart) / width)
    if (index < 0 || index >= count) continue
    sums[index].total += point.success_rate
    sums[index].n += 1
  }
  return sums.map((sum, index) => ({
    start: Math.round(windowStart + index * width),
    rate: sum.n > 0 ? sum.total / sum.n : null,
  }))
}
