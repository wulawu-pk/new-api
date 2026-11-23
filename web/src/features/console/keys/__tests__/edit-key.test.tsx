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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as keysApi from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
import * as libApi from '@/lib/api'

import { ConsoleKeys } from '..'
import { renderConsole } from '../../__tests__/render-console'
import { buildUpdateKeyPayload, editKeyValues } from '../lib/create-key'

vi.mock('@/features/keys/api', () => ({
  getApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  updateApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  fetchTokenKey: vi.fn(),
  updateApiKeyStatus: vi.fn(),
}))

const KEY: ApiKey = {
  id: 7,
  name: 'codex-laptop',
  key: 'pMH8**********03Sb',
  status: 1,
  remain_quota: 0,
  used_quota: 500000,
  unlimited_quota: true,
  expired_time: -1,
  created_time: 0,
  accessed_time: 0,
  group: 'gpt-pro',
  auto_groups: null,
  cross_group_retry: false,
  model_limits_enabled: true,
  model_limits: 'gpt-6',
  allow_ips: '10.0.0.1',
  allow_user_quota_query: true,
}

function listResponse(items: ApiKey[]) {
  return {
    success: true,
    data: { items, total: items.length, page: 1, page_size: 100 },
  }
}

beforeEach(() => {
  vi.spyOn(libApi, 'getUserGroups').mockResolvedValue({
    success: true,
    data: { 'gpt-pro': { desc: 'GPT', ratio: 0.5 } },
  })
  vi.mocked(keysApi.updateApiKey).mockResolvedValue({ success: true })
  vi.mocked(keysApi.updateApiKeyStatus).mockResolvedValue({ success: true })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('console keys page: edit', () => {
  it('saves a renamed key and keeps settings the dialog does not show', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(
      listResponse([KEY]) as never
    )
    const user = userEvent.setup()
    renderConsole(<ConsoleKeys />)

    await user.click(
      await screen.findByRole('button', { name: 'Edit key codex-laptop' })
    )
    const dialog = await screen.findByRole('dialog', { name: 'Edit key' })
    const name = within(dialog).getByRole('textbox', { name: 'Name' })
    expect(name).toHaveValue('codex-laptop')
    await user.clear(name)
    await user.type(name, 'codex-desktop')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(keysApi.updateApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 7,
          name: 'codex-desktop',
          group: 'gpt-pro',
          unlimited_quota: true,
          expired_time: -1,
          model_limits_enabled: true,
          model_limits: 'gpt-6',
          allow_ips: '10.0.0.1',
          allow_user_quota_query: true,
        })
      )
    )
    expect(keysApi.updateApiKeyStatus).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Edit key' })
      ).not.toBeInTheDocument()
    )
  })

  it('switches a used-up key back on once its cap is removed', async () => {
    const exhausted: ApiKey = {
      ...KEY,
      status: 4,
      unlimited_quota: false,
      remain_quota: 0,
    }
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(
      listResponse([exhausted]) as never
    )
    const user = userEvent.setup()
    renderConsole(<ConsoleKeys />)

    await user.click(
      await screen.findByRole('button', { name: 'Edit key codex-laptop' })
    )
    const dialog = await screen.findByRole('dialog', { name: 'Edit key' })
    await user.clear(
      within(dialog).getByRole('textbox', { name: 'Quota left' })
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(keysApi.updateApiKeyStatus).toHaveBeenCalledWith(7, 1)
    )
    expect(keysApi.updateApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ unlimited_quota: true })
    )
  })
})

describe('update-key payload', () => {
  it('keeps the current expiry date when "keep" is chosen', () => {
    const dated = { ...KEY, expired_time: 2_000_000_000 }
    const values = editKeyValues(dated)

    expect(values.expiry).toBe('keep')
    expect(buildUpdateKeyPayload(dated, values, 1000).expired_time).toBe(
      2_000_000_000
    )
  })

  it('sends the exact remaining quota when the field is left as shown', () => {
    const capped = { ...KEY, unlimited_quota: false, remain_quota: 1_234_567 }

    expect(
      buildUpdateKeyPayload(capped, editKeyValues(capped)).remain_quota
    ).toBe(1_234_567)
  })

  it('sets a fresh 30-day expiry from now', () => {
    const payload = buildUpdateKeyPayload(
      KEY,
      { ...editKeyValues(KEY), expiry: '30' },
      1000
    )
    expect(payload.expired_time).toBe(1000 + 30 * 86400)
  })
})
