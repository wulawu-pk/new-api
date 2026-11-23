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
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as keysApi from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
import * as libApi from '@/lib/api'
import { parseQuotaFromDollars } from '@/lib/format'

import { ConsoleKeys } from '..'
import { renderConsole } from '../../__tests__/render-console'
import { buildKeyPatch, editKeyValues } from '../lib/create-key'

vi.mock('@/features/keys/api', () => ({
  getApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  patchApiKey: vi.fn(),
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

async function openEdit() {
  const user = userEvent.setup()
  renderConsole(<ConsoleKeys />)
  await user.click(
    await screen.findByRole('button', { name: 'Edit key codex-laptop' })
  )
  const dialog = await screen.findByRole('dialog', { name: 'Edit key' })
  return { user, dialog }
}

beforeEach(() => {
  vi.spyOn(libApi, 'getUserGroups').mockResolvedValue({
    success: true,
    data: { 'gpt-pro': { desc: 'GPT', ratio: 0.5 } },
  })
  vi.mocked(keysApi.patchApiKey).mockResolvedValue({ success: true })
  vi.mocked(keysApi.updateApiKeyStatus).mockResolvedValue({ success: true })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('console keys page: edit', () => {
  it('sends only the new name when only the name changed', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(
      listResponse([KEY]) as never
    )
    const { user, dialog } = await openEdit()
    const name = within(dialog).getByRole('textbox', { name: 'Name' })
    expect(name).toHaveValue('codex-laptop')
    await user.clear(name)
    await user.type(name, 'codex-desktop')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(keysApi.patchApiKey).toHaveBeenCalledWith(7, {
        name: 'codex-desktop',
      })
    )
    expect(keysApi.updateApiKeyStatus).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Edit key' })
      ).not.toBeInTheDocument()
    )
  })

  it('closes without a request when nothing changed', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(
      listResponse([KEY]) as never
    )
    const { user, dialog } = await openEdit()
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Edit key' })
      ).not.toBeInTheDocument()
    )
    expect(keysApi.patchApiKey).not.toHaveBeenCalled()
  })

  it('lifts the cap of a used-up key without calling enable afterwards', async () => {
    const exhausted: ApiKey = {
      ...KEY,
      status: 4,
      unlimited_quota: false,
      remain_quota: 0,
    }
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(
      listResponse([exhausted]) as never
    )
    const { user, dialog } = await openEdit()
    await user.clear(
      within(dialog).getByRole('textbox', { name: 'Quota left' })
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(keysApi.patchApiKey).toHaveBeenCalledWith(7, {
        unlimited_quota: true,
        expected_remain_quota: 0,
        expected_unlimited_quota: false,
      })
    )
    expect(keysApi.updateApiKeyStatus).not.toHaveBeenCalled()
  })

  it('on a quota conflict keeps the dialog open and refills it with the current key', async () => {
    const capped: ApiKey = {
      ...KEY,
      unlimited_quota: false,
      remain_quota: parseQuotaFromDollars(10),
    }
    const spent: ApiKey = { ...capped, remain_quota: parseQuotaFromDollars(4) }
    vi.mocked(keysApi.getApiKeys)
      .mockResolvedValueOnce(listResponse([capped]) as never)
      .mockResolvedValue(listResponse([spent]) as never)
    vi.mocked(keysApi.patchApiKey).mockResolvedValue({
      success: false,
      code: 'token_conflict',
      message: 'quota changed',
    })
    const warning = vi.spyOn(toast, 'warning').mockImplementation(() => 0)
    const { user, dialog } = await openEdit()
    const quota = within(dialog).getByRole('textbox', { name: 'Quota left' })
    expect(quota).toHaveValue('10')
    await user.clear(quota)
    await user.type(quota, '20')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(quota).toHaveValue('4'))
    expect(keysApi.patchApiKey).toHaveBeenCalledWith(7, {
      remain_quota: parseQuotaFromDollars(20),
      expected_remain_quota: parseQuotaFromDollars(10),
      expected_unlimited_quota: false,
    })
    expect(screen.getByRole('dialog', { name: 'Edit key' })).toBeVisible()
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('The quota of this key changed')
    )

    // Saving again sends the refreshed quota as the expected one.
    vi.mocked(keysApi.patchApiKey).mockResolvedValue({ success: true })
    await user.clear(quota)
    await user.type(quota, '20')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(keysApi.patchApiKey).toHaveBeenLastCalledWith(7, {
        remain_quota: parseQuotaFromDollars(20),
        expected_remain_quota: parseQuotaFromDollars(4),
        expected_unlimited_quota: false,
      })
    )
  })
})

describe('key patch', () => {
  it('is null when nothing changed, also for a capped and dated key', () => {
    const dated = {
      ...KEY,
      expired_time: 2_000_000_000,
      unlimited_quota: false,
      remain_quota: 1_234_567,
    }
    expect(buildKeyPatch(KEY, editKeyValues(KEY), 1000)).toBeNull()
    expect(buildKeyPatch(dated, editKeyValues(dated), 1000)).toBeNull()
  })

  it('keeps the current expiry date when "keep" is chosen', () => {
    const dated = { ...KEY, expired_time: 2_000_000_000 }
    const values = editKeyValues(dated)

    expect(values.expiry).toBe('keep')
    expect(buildKeyPatch(dated, { ...values, name: 'x' }, 1000)).toEqual({
      name: 'x',
    })
  })

  it('sets a fresh 30-day expiry from now and nothing else', () => {
    expect(
      buildKeyPatch(KEY, { ...editKeyValues(KEY), expiry: '30' }, 1000)
    ).toEqual({ expired_time: 1000 + 30 * 86400 })
  })

  it('sends the group alone when only the group changed', () => {
    expect(
      buildKeyPatch(KEY, { ...editKeyValues(KEY), group: 'claude-kiro' })
    ).toEqual({ group: 'claude-kiro' })
  })

  it('treats 12.50 in a field showing 12.5 as unchanged', () => {
    const capped = {
      ...KEY,
      unlimited_quota: false,
      remain_quota: parseQuotaFromDollars(12.5),
    }
    expect(editKeyValues(capped).limit).toBe('12.5')
    expect(
      buildKeyPatch(capped, { ...editKeyValues(capped), limit: '12.50' })
    ).toBeNull()
  })

  it('caps an unlimited key with the expected unlimited state', () => {
    expect(buildKeyPatch(KEY, { ...editKeyValues(KEY), limit: '5' })).toEqual({
      remain_quota: parseQuotaFromDollars(5),
      unlimited_quota: false,
      expected_remain_quota: 0,
      expected_unlimited_quota: true,
    })
  })
})
