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

import type { GroupHealthSummary } from '../types'

/** Hourly samples kept for the per-group sparkline. */
export const GROUP_SPARKLINE_POINTS = 24

export type GroupSparklinePoint = { ts: number; success_rate: number }

/**
 * Keep only the latest usable success-rate samples. The backend already
 * trims to 24 points, but a cached or older payload must not break the strip.
 */
export function toSparklineSeries(
  series: PerformanceSeriesPoint[] | undefined
): GroupSparklinePoint[] {
  return (series ?? [])
    .filter(
      (point) =>
        Number.isFinite(point.ts) &&
        Number.isFinite(point.success_rate) &&
        point.success_rate >= 0 &&
        point.success_rate <= 100
    )
    .sort((a, b) => a.ts - b.ts)
    .slice(-GROUP_SPARKLINE_POINTS)
    .map((point) => ({ ts: point.ts, success_rate: point.success_rate }))
}

/** How many models of the model square are served by each group. */
export function countModelsByGroup(
  models: { enable_groups?: string[] }[] | undefined
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const model of models ?? []) {
    for (const group of model.enable_groups ?? []) {
      counts[group] = (counts[group] ?? 0) + 1
    }
  }
  return counts
}

/**
 * Request-weighted availability across every reported group, so one busy
 * group does not get averaged away by a dozen idle ones.
 */
export function overallAvailability(groups: GroupHealthSummary[]): number {
  let requests = 0
  let successes = 0
  for (const group of groups) {
    if (!Number.isFinite(group.request_count) || group.request_count <= 0) {
      continue
    }
    const rate = Number.isFinite(group.success_rate) ? group.success_rate : 0
    requests += group.request_count
    successes += (rate / 100) * group.request_count
  }
  if (requests === 0) return Number.NaN
  return Math.round((successes / requests) * 10000) / 100
}

export function totalRequests(groups: GroupHealthSummary[]): number {
  return groups.reduce(
    (sum, group) =>
      sum + (Number.isFinite(group.request_count) ? group.request_count : 0),
    0
  )
}
