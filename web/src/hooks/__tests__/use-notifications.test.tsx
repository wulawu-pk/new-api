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
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useNotificationStore } from '@/stores/notification-store'

import { useNotifications } from '../use-notifications'

vi.mock('@/lib/api', () => ({
  getNotice: async () => ({ success: true, data: '## Maintenance' }),
}))
// One object for every render, as the status query cache returns.
const statusResult = vi.hoisted(() => ({
  status: {
    announcements_enabled: true,
    announcements: [{ id: 2, content: 'Maintenance done', type: 'success' }],
  },
  loading: false,
}))
vi.mock('@/hooks/use-status', () => ({ useStatus: () => statusResult }))

function renderNotifications() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return renderHook(() => useNotifications(), {
    wrapper: (props: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        {props.children}
      </QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  useNotificationStore.setState({
    lastReadNotice: '',
    readAnnouncementKeys: [],
    closedUntilDate: null,
  })
})

afterEach(() => {
  cleanup()
})

describe('useNotifications', () => {
  it('counts the unread notice and announcement', async () => {
    const { result } = renderNotifications()

    await waitFor(() => expect(result.current.unreadCount).toBe(2))
  })

  it('drops the announcement from the unread count as soon as the timeline tab is opened', async () => {
    const { result } = renderNotifications()
    await waitFor(() => expect(result.current.unreadCount).toBe(2))

    act(() => result.current.setPopoverOpen(true))
    expect(result.current.unreadCount).toBe(1)

    act(() => result.current.setActiveTab('announcements'))
    expect(result.current.unreadCount).toBe(0)
  })
})
