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
import { cleanup, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as keysApi from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
import { useAuthStore } from '@/stores/auth-store'

import { renderConsole } from '../../__tests__/render-console'
import { savePendingPlan } from '../../auth/lib/pending-plan'
import { usePlanKey } from '../use-plan-key'

vi.mock('@/features/keys/api', () => ({
  getApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  fetchTokenKey: vi.fn(),
}))

function PlanKeyProbe() {
  usePlanKey()
  return null
}

function list(items: Partial<ApiKey>[]) {
  return {
    success: true,
    data: { items, total: items.length, page: 1, page_size: 100 },
  } as never
}

beforeEach(() => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'demo', role: 1 })
  vi.mocked(keysApi.createApiKey).mockResolvedValue({
    success: true,
    data: { id: 9, name: 'codex' },
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  sessionStorage.clear()
  useAuthStore.getState().auth.reset('idle')
})

describe('automatic key from a landing-page plan', () => {
  it('creates one key that never expires and has no cap, then opens the key list', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(list([]))
    savePendingPlan({ group: 'gpt-pro', model: 'gpt-6', client: 'Codex' })
    const { router } = renderConsole(<PlanKeyProbe />)

    await waitFor(() => expect(router.state.location.pathname).toBe('/keys'))
    expect(keysApi.createApiKey).toHaveBeenCalledTimes(1)
    expect(keysApi.createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'codex',
        group: 'gpt-pro',
        expired_time: -1,
        unlimited_quota: true,
        remain_quota: 0,
      })
    )
    expect(keysApi.fetchTokenKey).not.toHaveBeenCalled()
  })

  it('creates nothing when the group already has an enabled key', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(
      list([{ id: 3, name: 'mine', group: 'gpt-pro', status: 1 }])
    )
    savePendingPlan({ group: 'gpt-pro', client: 'Codex' })
    const { router } = renderConsole(<PlanKeyProbe />)

    await waitFor(() => expect(router.state.location.pathname).toBe('/keys'))
    expect(keysApi.createApiKey).not.toHaveBeenCalled()
  })

  it('creates the key only once, also when the console mounts again', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(list([]))
    savePendingPlan({ group: 'gpt-pro', client: 'Codex' })
    const first = renderConsole(<PlanKeyProbe />)
    await waitFor(() =>
      expect(first.router.state.location.pathname).toBe('/keys')
    )
    cleanup()

    // Same tab, landing link reopened (Back button): no second key.
    savePendingPlan({ group: 'gpt-pro', client: 'Codex' })
    renderConsole(<PlanKeyProbe />)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(keysApi.createApiKey).toHaveBeenCalledTimes(1)
  })

  it('does nothing before sign-in', async () => {
    useAuthStore.getState().auth.reset('idle')
    savePendingPlan({ group: 'gpt-pro' })
    renderConsole(<PlanKeyProbe />)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(keysApi.getApiKeys).not.toHaveBeenCalled()
    expect(keysApi.createApiKey).not.toHaveBeenCalled()
  })
})
