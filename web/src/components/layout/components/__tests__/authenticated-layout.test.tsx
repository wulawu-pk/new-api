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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConsoleLogs } from '@/features/console/request-logs'
import * as logsApi from '@/features/usage-logs/api'
import * as libApi from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { AuthenticatedLayout } from '../authenticated-layout'

vi.mock('@/features/usage-logs/api', () => ({
  getUserLogs: vi.fn(),
  getUserLogStats: vi.fn(),
  getAllLogs: vi.fn(),
  getLogStats: vi.fn(),
}))
// The shell chrome (top bar, notices, balance) is not under test here.
vi.mock('@/features/console/shell/console-shell', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/console/shell/console-shell')
  >()),
  ConsoleShell: (props: { children?: ReactNode }) => (
    <div data-testid='console-shell'>{props.children}</div>
  ),
}))

function renderLayout(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const root = createRootRoute({ component: AuthenticatedLayout })
  const pages = [
    createRoute({
      getParentRoute: () => root,
      path: '/usage-logs',
      component: ConsoleLogs,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/channels',
      component: () => <div>channels page</div>,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/usage-logs/$section',
      component: () => <div>tasks page</div>,
    }),
  ]
  const router = createRouter({
    routeTree: root.addChildren(pages),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  window.localStorage.removeItem('peroai:logs-live')
  useAuthStore
    .getState()
    .auth.setUser({ id: 2, username: 'demo', role: 1 } as never)
  vi.spyOn(libApi, 'getUserGroups').mockResolvedValue({
    success: true,
    data: {},
  })
  vi.mocked(logsApi.getUserLogs).mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 1, page_size: 50 },
  })
  vi.mocked(logsApi.getUserLogStats).mockResolvedValue({
    success: true,
    data: { quota: 0, rpm: 0, tpm: 0 },
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
})

describe('authenticated layout on sign-out', () => {
  it('unmounts a console page and stops its live polling', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      renderLayout('/usage-logs')
      expect(
        await screen.findByText('No requests in this period yet.')
      ).toBeInTheDocument()
      expect(screen.getByTestId('console-shell')).toBeInTheDocument()

      act(() => useAuthStore.getState().auth.reset())

      expect(screen.queryByTestId('console-shell')).not.toBeInTheDocument()
      expect(
        screen.queryByText('No requests in this period yet.')
      ).not.toBeInTheDocument()
      const lists = vi.mocked(logsApi.getUserLogs).mock.calls.length
      const totals = vi.mocked(logsApi.getUserLogStats).mock.calls.length
      // Live updates poll every 10 seconds; nothing may be sent any more.
      await act(() => vi.advanceTimersByTimeAsync(35_000))
      expect(vi.mocked(logsApi.getUserLogs).mock.calls.length).toBe(lists)
      expect(vi.mocked(logsApi.getUserLogStats).mock.calls.length).toBe(totals)
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders nothing for a signed-out visitor on an admin page either', async () => {
    useAuthStore.getState().auth.reset()
    renderLayout('/channels')
    await act(async () => undefined)
    expect(screen.queryByText('channels page')).not.toBeInTheDocument()
  })
})
