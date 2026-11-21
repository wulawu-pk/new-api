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
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'

import { getUserQuotaDates } from '@/features/dashboard/api'
import { getApiKeys } from '@/features/keys/api'
import { getUserLogs } from '@/features/usage-logs/api'
import { LOG_TYPE_ENUM } from '@/features/usage-logs/constants'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import { requireServerSuccess } from '@/lib/server-error-message'

/** Usage rows from the start of this month (hourly buckets). */
export function useMonthUsage() {
  return useQuery({
    queryKey: ['console', 'overview', 'month-usage'],
    queryFn: async () => {
      const now = dayjs()
      // The 7-day chart may reach back into last month.
      const monthStart = now.startOf('month')
      const weekStart = now.startOf('day').subtract(6, 'day')
      const start = monthStart.isBefore(weekStart) ? monthStart : weekStart
      const response = requireServerSuccess(
        await getUserQuotaDates({
          start_timestamp: start.unix(),
          end_timestamp: now.unix(),
          default_time: 'hour',
        })
      )
      return response.data ?? []
    },
    meta: { errorToast: false },
  })
}

/** Request totals this month: successful (consume) and failed (error) logs. */
export function useMonthRequestTotals() {
  return useQuery({
    queryKey: ['console', 'overview', 'month-totals'],
    queryFn: async () => {
      const start = dayjs().startOf('month').unix()
      const end = dayjs().unix()
      const [ok, failed] = await Promise.all(
        [LOG_TYPE_ENUM.CONSUME, LOG_TYPE_ENUM.ERROR].map(async (type) => {
          const response = requireServerSuccess(
            await getUserLogs({
              p: 1,
              page_size: 1,
              type,
              start_timestamp: start,
              end_timestamp: end,
            })
          )
          return response.data?.total ?? 0
        })
      )
      return { ok, failed }
    },
    meta: { errorToast: false },
  })
}

/** Latest successful requests (used for the table and the cache average). */
export function useRecentRequests(pageSize: number) {
  return useQuery({
    queryKey: ['console', 'overview', 'recent', pageSize],
    queryFn: async () => {
      const response = requireServerSuccess(
        await getUserLogs({
          p: 1,
          page_size: pageSize,
          type: LOG_TYPE_ENUM.CONSUME,
        })
      )
      return (response.data?.items ?? []) as UsageLog[]
    },
    meta: { errorToast: false },
  })
}

/** Whether the user has created any key (for the onboarding checklist). */
export function useHasKeys(enabled: boolean) {
  return useQuery({
    queryKey: ['console', 'overview', 'has-keys'],
    queryFn: async () => {
      const response = requireServerSuccess(await getApiKeys({ p: 1, size: 1 }))
      return (response.data?.total ?? 0) > 0
    },
    enabled,
    meta: { errorToast: false },
  })
}
