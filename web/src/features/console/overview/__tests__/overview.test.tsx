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
import { cleanup, fireEvent, screen } from '@testing-library/react'
import dayjs from 'dayjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as dashboardApi from '@/features/dashboard/api'
import * as keysApi from '@/features/keys/api'
import * as profileApi from '@/features/profile/api'
import * as logsApi from '@/features/usage-logs/api'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import { useAuthStore } from '@/stores/auth-store'

import { ConsoleOverview } from '..'
import { renderConsole } from '../../__tests__/render-console'
import {
  availability,
  averageCacheHitRate,
  bucketByDay,
  formatPercentFloor,
} from '../lib/overview-data'

vi.mock('@/features/dashboard/api', () => ({ getUserQuotaDates: vi.fn() }))
vi.mock('@/features/keys/api', () => ({ getApiKeys: vi.fn() }))
vi.mock('@/features/profile/api', () => ({ getUserProfile: vi.fn() }))
vi.mock('@/features/usage-logs/api', () => ({ getUserLogs: vi.fn() }))

function signIn() {
  useAuthStore.setState((state) => ({
    auth: {
      ...state.auth,
      user: { id: 2, username: 'demo', role: 1 } as never,
    },
  }))
}

function selfUser(requestCount: number, quota: number) {
  vi.mocked(profileApi.getUserProfile).mockResolvedValue({
    success: true,
    data: {
      id: 2,
      username: 'demo',
      role: 1,
      quota,
      used_quota: 0,
      request_count: requestCount,
    } as never,
  })
}

beforeEach(() => {
  signIn()
  vi.mocked(dashboardApi.getUserQuotaDates).mockResolvedValue({
    success: true,
    data: [],
  })
  vi.mocked(logsApi.getUserLogs).mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 1, page_size: 100 },
  })
  vi.mocked(keysApi.getApiKeys).mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 1, page_size: 1 },
  } as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useAuthStore.getState().auth.reset('idle')
  localStorage.clear()
})

describe('overview data', () => {
  it('buckets hourly rows into the last seven days, today last', () => {
    const now = dayjs('2026-11-21T15:00:00')
    const days = bucketByDay(
      [
        {
          created_at: dayjs('2026-11-21T09:00:00').unix(),
          quota: 100,
          count: 2,
        },
        {
          created_at: dayjs('2026-11-15T23:00:00').unix(),
          quota: 50,
          count: 1,
        },
        {
          created_at: dayjs('2026-11-14T23:00:00').unix(),
          quota: 999,
          count: 9,
        },
      ],
      now
    )
    expect(days).toHaveLength(7)
    expect(days[6].quota).toBe(100)
    expect(days[0].quota).toBe(50)
    expect(days.reduce((sum, d) => sum + d.quota, 0)).toBe(150)
  })

  it('weights the cache hit by prompt size and skips requests without cache data', () => {
    const logs = [
      { prompt_tokens: 1000, other: JSON.stringify({ cache_tokens: 900 }) },
      { prompt_tokens: 1000, other: JSON.stringify({ cache_tokens: 100 }) },
    ] as UsageLog[]
    expect(averageCacheHitRate(logs)).toBeCloseTo(0.5)
    expect(
      averageCacheHitRate([{ prompt_tokens: 10, other: '{}' }] as UsageLog[])
    ).toBeNull()
  })

  it('reports no availability without requests and rounds percentages down', () => {
    expect(availability(0, 0)).toBeNull()
    expect(formatPercentFloor(availability(999, 1) as number)).toBe('99.9%')
    expect(formatPercentFloor(0.99999)).toBe('99.9%')
  })
})

describe('console overview page', () => {
  it('shows the start guide with no step done to a new user without a key', async () => {
    selfUser(0, 0)
    renderConsole(<ConsoleOverview />)

    expect(
      await screen.findByText('Three steps to connect peroai')
    ).toBeInTheDocument()
    expect(screen.getByText('0 of 3 done')).toBeInTheDocument()
    expect(
      screen.getByText('Create a key to fill in the real command')
    ).toBeInTheDocument()
    expect(screen.getByText('Tips')).toBeInTheDocument()
  })

  it('ticks off every step and fills the request with the masked key once the user is set up', async () => {
    selfUser(12, 500000)
    vi.mocked(keysApi.getApiKeys).mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 7,
            name: 'codex',
            key: 'pMH8**********03Sb',
            status: 1,
            group: 'gpt-pro',
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      },
    } as never)
    renderConsole(<ConsoleOverview />)

    expect(await screen.findByText('3 of 3 done')).toBeInTheDocument()
    expect(screen.getByText('codex')).toBeInTheDocument()
    expect(
      screen.getByText(/Authorization: Bearer sk-…03Sb/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Copy command' })
    ).toBeInTheDocument()
  })

  it('folds the guide away on request and brings it back from the header', async () => {
    selfUser(12, 500000)
    renderConsole(<ConsoleOverview />)
    await screen.findByText('Three steps to connect peroai')

    fireEvent.click(screen.getByRole('button', { name: 'Hide guide' }))

    expect(
      screen.queryByText('Three steps to connect peroai')
    ).not.toBeInTheDocument()
    expect(localStorage.getItem('peroai:start-guide-hidden')).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: 'Setup guide' }))

    expect(
      screen.getByText('Three steps to connect peroai')
    ).toBeInTheDocument()
    expect(localStorage.getItem('peroai:start-guide-hidden')).toBeNull()
  })

  it('keeps the guide folded on the next visit after it was hidden', async () => {
    localStorage.setItem('peroai:start-guide-hidden', '1')
    selfUser(12, 500000)
    renderConsole(<ConsoleOverview />)

    expect(
      await screen.findByRole('button', { name: 'Setup guide' })
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Three steps to connect peroai')
    ).not.toBeInTheDocument()
  })

  it('tells a new user how to make the first request when there are no logs', async () => {
    selfUser(0, 0)
    renderConsole(<ConsoleOverview />)

    expect(await screen.findByText(/No requests yet/)).toBeInTheDocument()
    expect(
      await screen.findByText('No spending in the last 7 days.')
    ).toBeInTheDocument()
  })

  it('names the failed endpoint when usage cannot load', async () => {
    selfUser(5, 0)
    vi.mocked(dashboardApi.getUserQuotaDates).mockResolvedValue({
      success: false,
      message: 'db down',
    } as never)
    renderConsole(<ConsoleOverview />)

    expect(
      (await screen.findAllByText('/api/data/self')).length
    ).toBeGreaterThan(0)
  })
})
