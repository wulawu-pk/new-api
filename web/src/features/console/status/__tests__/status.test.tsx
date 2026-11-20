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
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as statusApi from '@/features/service-status/api'

import { ConsoleStatus } from '..'
import { renderConsole } from '../../__tests__/render-console'
import { toSlots } from '../lib/slots'

vi.mock('@/features/service-status/api', () => ({ getGroupSummary: vi.fn() }))

const point = (ts: number, rate: number) => ({
  ts,
  success_rate: rate,
  avg_ttft_ms: 0,
  avg_latency_ms: 0,
  avg_tps: 0,
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('status slots', () => {
  it('averages points into equal slots and leaves empty slots null', () => {
    const slots = toSlots(
      [point(0, 100), point(1800, 98), point(7200, 99)],
      0,
      4 * 3600,
      4
    )
    expect(slots.map((s) => s.rate)).toEqual([99, null, 99, null])
  })

  it('ignores points outside the window', () => {
    expect(
      toSlots([point(-10, 50), point(99999, 50)], 0, 3600, 2).every(
        (s) => s.rate === null
      )
    ).toBe(true)
  })
})

describe('console status page', () => {
  it('rates a busy group and holds back a group with too few requests', async () => {
    vi.mocked(statusApi.getGroupSummary).mockResolvedValue({
      window_start: 0,
      window_end: 86400,
      groups: [
        {
          group: 'gpt-pro',
          request_count: 500,
          success_rate: 99.8,
          avg_latency_ms: 1200,
          avg_ttft_ms: 900,
          avg_tps: 60,
          series: [],
        },
        {
          group: 'deepseek',
          request_count: 3,
          success_rate: 100,
          avg_latency_ms: 0,
          avg_ttft_ms: 0,
          avg_tps: 0,
          series: [],
        },
        {
          group: 'default',
          request_count: 50,
          success_rate: 50,
          avg_latency_ms: 0,
          avg_ttft_ms: 0,
          avg_tps: 0,
          series: [],
        },
      ],
    })
    renderConsole(<ConsoleStatus />)

    expect(await screen.findByText('99.8%')).toBeInTheDocument()
    expect(screen.getByText('Too few requests to rate')).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'default' })
    ).not.toBeInTheDocument()
  })

  it('switches to the 7-day window', async () => {
    vi.mocked(statusApi.getGroupSummary).mockResolvedValue({ groups: [] })
    const user = userEvent.setup()
    renderConsole(<ConsoleStatus />)

    await user.click(await screen.findByRole('button', { name: '7 days' }))
    expect(statusApi.getGroupSummary).toHaveBeenLastCalledWith(168)
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('names the failed endpoint when the summary cannot load', async () => {
    vi.mocked(statusApi.getGroupSummary).mockRejectedValue(new Error('network'))
    renderConsole(<ConsoleStatus />)

    expect(
      await screen.findByText('/api/perf-metrics/groups?hours=24')
    ).toBeInTheDocument()
  })
})
