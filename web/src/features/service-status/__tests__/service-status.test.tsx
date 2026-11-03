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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { ServiceStatus } from '..'

const pricing = vi.hoisted(() => ({ usePricingData: vi.fn() }))

// The header needs a router context; the page body is what this suite covers.
vi.mock('@/components/layout', () => ({
  PublicLayout: (props: { children?: unknown }) => props.children,
}))
vi.mock('@/features/pricing/hooks', () => ({
  usePricingData: pricing.usePricingData,
}))

const HOUR = 3600
const WINDOW_START = 1789387200

function groupResponse() {
  return {
    data: {
      success: true,
      data: {
        window_start: WINDOW_START,
        window_end: WINDOW_START + 23 * HOUR,
        groups: [
          {
            group: 'gpt-pro',
            request_count: 1700,
            success_rate: 99.5,
            avg_latency_ms: 1200,
            avg_ttft_ms: 320,
            avg_tps: 42,
            series: [
              {
                ts: WINDOW_START,
                avg_ttft_ms: 300,
                avg_latency_ms: 1200,
                success_rate: 100,
                avg_tps: 40,
              },
              {
                ts: WINDOW_START + HOUR,
                avg_ttft_ms: 340,
                avg_latency_ms: 1200,
                success_rate: 99,
                avg_tps: 44,
              },
            ],
          },
          {
            group: 'claude-kiro',
            request_count: 40,
            success_rate: 62.5,
            avg_latency_ms: 2500,
            avg_ttft_ms: 0,
            avg_tps: 0,
            series: [],
          },
        ],
      },
    },
  }
}

let queryClient: QueryClient

beforeEach(() => {
  pricing.usePricingData.mockReturnValue({
    models: [
      { model_name: 'gpt-5.2', enable_groups: ['gpt-pro'] },
      { model_name: 'gpt-5.2-mini', enable_groups: ['gpt-pro'] },
      { model_name: 'claude-sonnet-4.5', enable_groups: ['claude-kiro'] },
    ],
    usableGroup: {
      'gpt-pro': { desc: 'GPT Pro', ratio: 1 },
      'claude-kiro': { desc: 'Claude Kiro', ratio: 1.5 },
    },
  })
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
})

afterEach(() => {
  queryClient.clear()
  pricing.usePricingData.mockReset()
})

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ServiceStatus />
    </QueryClientProvider>
  )
}

describe('service status page', () => {
  it('renders one card per group with its availability, latency and throughput', async () => {
    const request = vi.spyOn(api, 'get').mockResolvedValue(groupResponse())

    renderPage()

    const pro = await screen.findByRole('region', {
      name: 'Health of group gpt-pro',
    })
    expect(within(pro).getByText('GPT Pro')).toBeVisible()
    expect(within(pro).getByText('gpt-pro')).toBeVisible()
    expect(within(pro).getByText('99.50%')).toBeVisible()
    expect(within(pro).getByText('1.20s')).toBeVisible()
    expect(within(pro).getByText('320ms')).toBeVisible()
    expect(within(pro).getByText('42.0 t/s')).toBeVisible()
    expect(within(pro).getByText('Models').parentElement).toHaveTextContent(
      'Models2'
    )
    expect(
      within(pro).getByRole('img', { name: 'Availability of group gpt-pro' })
    ).toBeVisible()

    const kiro = screen.getByRole('region', {
      name: 'Health of group claude-kiro',
    })
    expect(within(kiro).getByText('Claude Kiro')).toBeVisible()
    expect(within(kiro).getByText('62.50%')).toBeVisible()
    expect(within(kiro).getByText('2.50s')).toBeVisible()
    expect(within(kiro).getByText('Models').parentElement).toHaveTextContent(
      'Models1'
    )
    // No samples and no TTFT/throughput samples stay as placeholders.
    expect(
      within(kiro).getByRole('img', {
        name: 'No availability data available',
      })
    ).toBeVisible()
    expect(within(kiro).getAllByText('—').length).toBeGreaterThanOrEqual(2)

    // Request-weighted availability across both groups, not a plain average.
    expect(screen.getByText('98.65%')).toBeVisible()

    expect(request).toHaveBeenCalledWith('/api/perf-metrics/groups', {
      params: { hours: 24 },
    })
  })

  it('reloads the summary with the 7 day window', async () => {
    const request = vi.spyOn(api, 'get').mockResolvedValue(groupResponse())
    const user = userEvent.setup()

    renderPage()
    await screen.findByRole('region', { name: 'Health of group gpt-pro' })

    await user.click(screen.getByRole('button', { name: 'Last 7 days' }))

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/api/perf-metrics/groups', {
        params: { hours: 168 },
      })
    )
  })

  it('shows the empty placeholder instead of a blank page when no group reported traffic', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: { groups: [] } },
    })

    renderPage()

    expect(
      await screen.findByText('No service status data available yet')
    ).toBeVisible()
    expect(screen.queryByText('Overall availability')).not.toBeInTheDocument()
  })

  it('shows a retryable error state when the request fails', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('groups unavailable'))

    renderPage()

    expect(
      await screen.findByText('Unable to load service status')
    ).toBeVisible()
    expect(screen.getByText('groups unavailable')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
  })
})
