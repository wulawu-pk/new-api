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
import dayjs from 'dayjs'

import { LOG_TYPE_ENUM } from '@/features/usage-logs/constants'

export const LOG_RANGES = ['today', '7d', 'month'] as const
export type LogRange = (typeof LOG_RANGES)[number]

export const LOG_KINDS = ['ok', 'failed'] as const
export type LogKind = (typeof LOG_KINDS)[number]

/** Whose logs an admin is looking at; other users only see their own. */
export const LOG_SCOPES = ['all', 'self'] as const
export type LogScope = (typeof LOG_SCOPES)[number]

export const LOG_PAGE_SIZE = 50

/** Start of a log time range, unix seconds. */
export function rangeStart(
  range: LogRange,
  now: dayjs.Dayjs = dayjs()
): number {
  if (range === 'today') return now.startOf('day').unix()
  if (range === '7d') return now.startOf('day').subtract(6, 'day').unix()
  return now.startOf('month').unix()
}

export function kindToLogType(kind: LogKind): number {
  return kind === 'failed' ? LOG_TYPE_ENUM.ERROR : LOG_TYPE_ENUM.CONSUME
}

export type LogFilters = {
  range: LogRange
  kind: LogKind
  group: string
  model: string
  page: number
  /** Admins only: every user's logs (`/api/log/`) or their own. */
  scope: LogScope
  /** Admins only, with scope `all`: one user's logs. */
  username: string
}

/** Whether these filters ask for every user's logs (admin endpoints). */
export function isAllUsers(filters: LogFilters, isAdmin: boolean): boolean {
  return isAdmin && filters.scope === 'all'
}

/**
 * A search box's text as a log API filter that matches anywhere in the
 * field: `sonnet` → `%sonnet%`. The server matches exactly unless the value
 * has `%`, and a `%` pattern must keep at least 2 other characters (at most
 * two `%`), so a single character is not sent yet. Text the user already
 * wrote with `%` is passed through as their own pattern.
 */
export function containsFilter(value: string): string | undefined {
  const text = value.trim()
  if (text.includes('%')) return text
  if (text.length < 2) return undefined
  return `%${text}%`
}

/**
 * Query parameters for /api/log/self and /api/log/self/stat. The admin
 * endpoints take the same ones plus `username` (see `adminLogQuery`).
 */
export function buildLogQuery(filters: LogFilters, now: dayjs.Dayjs = dayjs()) {
  return {
    type: kindToLogType(filters.kind),
    start_timestamp: rangeStart(filters.range, now),
    end_timestamp: now.unix(),
    group: filters.group || undefined,
    model_name: containsFilter(filters.model),
  }
}

/** Query parameters for the admin /api/log/ and /api/log/stat. */
export function adminLogQuery(filters: LogFilters, now: dayjs.Dayjs = dayjs()) {
  return {
    ...buildLogQuery(filters, now),
    username: containsFilter(filters.username),
  }
}

export function pageCount(total: number, pageSize = LOG_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize))
}
