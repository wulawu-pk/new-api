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
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as logsApi from '@/features/usage-logs/api'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import * as libApi from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { ConsoleLogs } from '..'
import { renderConsole } from '../../__tests__/render-console'
import {
  buildLogQuery,
  containsFilter,
  pageCount,
  rangeStart,
} from '../lib/filters'
import { compactTokens, toConsoleLogRow } from '../lib/log-row'

vi.mock('@/features/usage-logs/api', () => ({
  getUserLogs: vi.fn(),
  getUserLogStats: vi.fn(),
  getAllLogs: vi.fn(),
  getLogStats: vi.fn(),
}))

function log(partial: Partial<UsageLog>): UsageLog {
  return {
    id: 1,
    user_id: 2,
    created_at: dayjs('2026-11-21T14:32:08').unix(),
    type: 2,
    content: '',
    username: 'demo',
    token_name: 'codex-laptop',
    model_name: 'gpt-6-astra',
    quota: 12600,
    prompt_tokens: 8210,
    completion_tokens: 1402,
    use_time: 7,
    is_stream: true,
    channel: 0,
    channel_name: '',
    token_id: 1,
    group: 'gpt-pro',
    ip: '',
    other: JSON.stringify({ cache_tokens: 7471, frt: 1200, group_ratio: 0.5 }),
    request_id: 'r1',
    upstream_request_id: '',
    ...partial,
  }
}

beforeEach(() => {
  vi.spyOn(libApi, 'getUserGroups').mockResolvedValue({
    success: true,
    data: {},
  })
  vi.mocked(logsApi.getUserLogStats).mockResolvedValue({
    success: true,
    data: { quota: 25000, rpm: 0, tpm: 0 },
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
})

describe('log rows', () => {
  it('computes the cache hit of an OpenAI-shaped request against the prompt', () => {
    const row = toConsoleLogRow(log({}))
    expect(row.cacheHit).toBeCloseTo(7471 / 8210)
    expect(row.firstToken).toBe(1.2)
    expect(row.groupRatio).toBe(0.5)
  })

  it('reports no cache hit when the upstream reported no cache activity', () => {
    expect(toConsoleLogRow(log({ other: '{}' })).cacheHit).toBeNull()
  })

  it('marks failed requests', () => {
    expect(
      toConsoleLogRow(log({ type: 5, content: 'upstream 502' })).isError
    ).toBe(true)
  })

  it('compacts token counts', () => {
    expect(compactTokens(0)).toBe('0')
    expect(compactTokens(820)).toBe('820')
    expect(compactTokens(8210)).toBe('8.2K')
    expect(compactTokens(1_500_000)).toBe('1.5M')
  })
})

describe('log filters', () => {
  const now = dayjs('2026-11-21T14:00:00')

  it('starts today, the last 7 days and this month at local midnight', () => {
    expect(rangeStart('today', now)).toBe(dayjs('2026-11-21T00:00:00').unix())
    expect(rangeStart('7d', now)).toBe(dayjs('2026-11-15T00:00:00').unix())
    expect(rangeStart('month', now)).toBe(dayjs('2026-11-01T00:00:00').unix())
  })

  it('asks for error logs when filtering failed requests and omits empty filters', () => {
    const query = buildLogQuery(
      {
        range: 'today',
        kind: 'failed',
        group: '',
        model: '  ',
        page: 1,
        scope: 'self',
        username: '',
      },
      now
    )
    expect(query.type).toBe(5)
    expect(query.group).toBeUndefined()
    expect(query.model_name).toBeUndefined()
  })

  it('turns search text into a contains-match pattern and waits for two characters', () => {
    expect(containsFilter(' sonnet ')).toBe('%sonnet%')
    expect(containsFilter('a')).toBeUndefined()
    expect(containsFilter('')).toBeUndefined()
    expect(containsFilter('claude-%-5')).toBe('claude-%-5')
  })

  it('always has at least one page', () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(101, 50)).toBe(3)
  })
})

describe('console logs page', () => {
  it('shows skeleton rows while loading', async () => {
    vi.mocked(logsApi.getUserLogs).mockReturnValue(new Promise(() => {}))
    renderConsole(<ConsoleLogs />)

    await waitFor(() =>
      expect(screen.getAllByTestId('skeleton-row')).toHaveLength(4)
    )
  })

  it('says there are no requests yet when the period is empty', async () => {
    vi.mocked(logsApi.getUserLogs).mockResolvedValue({
      success: true,
      data: { items: [], total: 0, page: 1, page_size: 50 },
    })
    renderConsole(<ConsoleLogs />)

    expect(
      await screen.findByText('No requests in this period yet.')
    ).toBeInTheDocument()
  })

  it('names the failed endpoint when the list cannot load', async () => {
    vi.mocked(logsApi.getUserLogs).mockResolvedValue({
      success: false,
      message: 'timeout',
    })
    renderConsole(<ConsoleLogs />)

    expect(await screen.findByText('/api/log/self')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('expands a row with Enter to show the billing breakdown', async () => {
    vi.mocked(logsApi.getUserLogs).mockResolvedValue({
      success: true,
      data: { items: [log({})], total: 1, page: 1, page_size: 50 },
    })
    const user = userEvent.setup()
    renderConsole(<ConsoleLogs />)

    const row = (await screen.findByText('gpt-6-astra')).closest(
      'tr'
    ) as HTMLElement
    expect(row).toHaveAttribute('aria-expanded', 'false')
    row.focus()
    await user.keyboard('{Enter}')

    expect(row).toHaveAttribute('aria-expanded', 'true')
    const detail = row.nextElementSibling as HTMLElement
    expect(within(detail).getByText('By token')).toBeInTheDocument()
    expect(within(detail).getByText('7,471')).toBeInTheDocument()
  })
})

describe('console logs page for admins', () => {
  const PAGE = (items: UsageLog[], total: number) => ({
    success: true,
    data: { items, total, page: 1, page_size: 50 },
  })

  beforeEach(() => {
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'root', role: 100 } as never)
    vi.mocked(logsApi.getLogStats).mockResolvedValue({
      success: true,
      data: { quota: 25000, rpm: 0, tpm: 0 },
    })
  })

  it('an admin starts on every user’s logs with a user column', async () => {
    vi.mocked(logsApi.getAllLogs).mockResolvedValue(
      PAGE([log({ username: 'alice' })], 1)
    )
    renderConsole(<ConsoleLogs />)

    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'User' })
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: 'Pagination' })).getByText(
        '1 / 1'
      )
    ).toBeInTheDocument()
    expect(logsApi.getUserLogs).not.toHaveBeenCalled()
  })

  it('an admin narrows to one user by username, or switches to their own requests', async () => {
    vi.mocked(logsApi.getAllLogs).mockResolvedValue(PAGE([log({})], 1))
    vi.mocked(logsApi.getUserLogs).mockResolvedValue(PAGE([log({})], 1))
    const user = userEvent.setup()
    renderConsole(<ConsoleLogs />)

    await user.type(await screen.findByLabelText('Username'), 'alice')
    await waitFor(() =>
      expect(logsApi.getAllLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ username: '%alice%', p: 1 })
      )
    )

    await user.click(screen.getByLabelText('Whose requests'))
    await user.click(screen.getByRole('option', { name: 'My requests' }))
    await waitFor(() => expect(logsApi.getUserLogs).toHaveBeenCalled())
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('columnheader', { name: 'User' })
    ).not.toBeInTheDocument()
  })

  it('a non-admin has no user switch and reads only their own logs', async () => {
    useAuthStore
      .getState()
      .auth.setUser({ id: 2, username: 'demo', role: 1 } as never)
    vi.mocked(logsApi.getUserLogs).mockResolvedValue(PAGE([log({})], 1))
    renderConsole(<ConsoleLogs />)

    await screen.findByText('gpt-6-astra')
    expect(screen.queryByLabelText('Whose requests')).not.toBeInTheDocument()
    expect(logsApi.getAllLogs).not.toHaveBeenCalled()
  })

  it('shows the total even on a single page and turns to the next page when there are more', async () => {
    vi.mocked(logsApi.getAllLogs).mockResolvedValue(PAGE([log({})], 120))
    const user = userEvent.setup()
    renderConsole(<ConsoleLogs />)

    const pager = await screen.findByRole('navigation', { name: 'Pagination' })
    expect(within(pager).getByText('1 / 3')).toBeInTheDocument()
    await user.click(within(pager).getByRole('button', { name: 'Next page' }))
    await waitFor(() =>
      expect(logsApi.getAllLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ p: 2 })
      )
    )
  })
})

describe('console logs search', () => {
  it('a model search matches anywhere in the name', async () => {
    vi.mocked(logsApi.getUserLogs).mockResolvedValue({
      success: true,
      data: { items: [log({})], total: 1, page: 1, page_size: 50 },
    })
    const user = userEvent.setup()
    renderConsole(<ConsoleLogs />)

    await user.type(await screen.findByLabelText('Search model'), 'astra')
    await waitFor(() =>
      expect(logsApi.getUserLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ model_name: '%astra%' })
      )
    )
  })
})
