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

import { ConsoleKeys } from '..'
import { renderConsole } from '../../__tests__/render-console'
import { buildCreateKeyPayload, maskedKeyTail } from '../lib/create-key'

vi.mock('@/features/keys/api', () => ({
  getApiKeys: vi.fn(),
  createApiKey: vi.fn(),
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
  model_limits_enabled: false,
  model_limits: '',
  allow_ips: '',
  allow_user_quota_query: false,
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
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('console keys page', () => {
  it('shows skeleton rows while the list is loading', () => {
    vi.mocked(keysApi.getApiKeys).mockReturnValue(new Promise(() => {}))
    renderConsole(<ConsoleKeys />)

    return waitFor(() =>
      expect(screen.getAllByTestId('skeleton-row')).toHaveLength(4)
    )
  })

  it('explains what a key is and offers to create one when there are none', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(listResponse([]) as never)
    renderConsole(<ConsoleKeys />)

    expect(await screen.findByText(/No keys yet/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Create Key' })).toHaveLength(
      2
    )
  })

  it('names the failed endpoint and retries on request', async () => {
    vi.mocked(keysApi.getApiKeys)
      .mockResolvedValueOnce({
        success: false,
        message: 'upstream down',
      } as never)
      .mockResolvedValueOnce(listResponse([KEY]) as never)
    const user = userEvent.setup()
    renderConsole(<ConsoleKeys />)

    expect(await screen.findByText('/api/token/')).toBeInTheDocument()
    expect(screen.getByText(/upstream down/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('codex-laptop')).toBeInTheDocument()
  })

  it('lists a key with only its last four characters and its group name', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(
      listResponse([KEY]) as never
    )
    renderConsole(<ConsoleKeys />)

    const row = (await screen.findByText('codex-laptop')).closest(
      'tr'
    ) as HTMLElement
    expect(within(row).getByText('sk-…03Sb')).toBeInTheDocument()
    expect(within(row).getByText('GPT Enterprise')).toBeInTheDocument()
    expect(row).not.toHaveTextContent('pMH8')
  })

  it('deletes a key only after confirming', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(
      listResponse([KEY]) as never
    )
    vi.mocked(keysApi.deleteApiKey).mockResolvedValue({ success: true })
    const user = userEvent.setup()
    renderConsole(<ConsoleKeys />)

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(keysApi.deleteApiKey).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(keysApi.deleteApiKey).toHaveBeenCalledWith(7))
  })

  it('opens the create dialog when asked to on arrival', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(listResponse([]) as never)
    const handled = vi.fn()
    renderConsole(<ConsoleKeys openCreate onOpenCreateHandled={handled} />)

    expect(
      await screen.findByRole('dialog', { name: 'Create Key' })
    ).toBeInTheDocument()
    expect(handled).toHaveBeenCalled()
  })
})

describe('console keys page: create and status', () => {
  it('when the new key cannot be read, retrying reads it again and creates nothing', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(listResponse([]) as never)
    vi.mocked(keysApi.createApiKey).mockResolvedValue({
      success: true,
      data: { id: 21, name: 'cc' },
    })
    vi.mocked(keysApi.fetchTokenKey)
      .mockResolvedValueOnce({ success: false, message: 'busy' })
      .mockResolvedValueOnce({ success: true, data: { key: 'abc' } })
    const error = vi.spyOn(toast, 'error').mockImplementation(() => 0)
    const user = userEvent.setup()
    renderConsole(<ConsoleKeys openCreate />)

    const dialog = await screen.findByRole('dialog', { name: 'Create Key' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'cc')
    await user.click(within(dialog).getByRole('button', { name: 'Create it' }))

    const notice = await screen.findByRole('dialog', { name: 'Key created' })
    expect(notice).toHaveTextContent('could not be loaded')
    expect(error).not.toHaveBeenCalled()
    // The list is refreshed as soon as the key exists.
    await waitFor(() =>
      expect(vi.mocked(keysApi.getApiKeys).mock.calls.length).toBeGreaterThan(1)
    )

    await user.click(
      within(notice).getByRole('button', { name: 'Load the key again' })
    )
    await waitFor(() => expect(keysApi.fetchTokenKey).toHaveBeenCalledTimes(2))
    expect(keysApi.fetchTokenKey).toHaveBeenLastCalledWith(21)
    expect(keysApi.createApiKey).toHaveBeenCalledTimes(1)
  })

  it('on a status conflict refreshes the list and explains why', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(
      listResponse([KEY]) as never
    )
    vi.mocked(keysApi.updateApiKeyStatus).mockResolvedValue({
      success: false,
      code: 'token_conflict',
      message: 'changed',
    })
    const warning = vi.spyOn(toast, 'warning').mockImplementation(() => 0)
    const error = vi.spyOn(toast, 'error').mockImplementation(() => 0)
    const user = userEvent.setup()
    renderConsole(<ConsoleKeys />)

    await user.click(await screen.findByRole('button', { name: 'Disable' }))

    await waitFor(() =>
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('The quota of this key changed')
      )
    )
    expect(error).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(vi.mocked(keysApi.getApiKeys).mock.calls.length).toBeGreaterThan(1)
    )
  })
})

describe('create-key payload', () => {
  it('builds an unlimited single-group key that never expires by default', () => {
    expect(
      buildCreateKeyPayload({
        name: ' cc ',
        group: 'claude-kiro',
        limit: '',
        expiry: 'never',
      })
    ).toMatchObject({
      name: 'cc',
      group: 'claude-kiro',
      unlimited_quota: true,
      remain_quota: 0,
      expired_time: -1,
      auto_groups: [],
      model_limits_enabled: false,
    })
  })

  it('converts a dollar limit and a 30-day expiry', () => {
    const payload = buildCreateKeyPayload(
      { name: 'x', group: 'gpt-pro', limit: '5', expiry: '30' },
      1000
    )
    expect(payload.unlimited_quota).toBe(false)
    expect(payload.remain_quota).toBeGreaterThan(0)
    expect(payload.expired_time).toBe(1000 + 30 * 86400)
  })

  it('shows only the tail of a masked key', () => {
    expect(maskedKeyTail('pMH8**********03Sb')).toBe('sk-…03Sb')
    expect(maskedKeyTail('')).toBe('sk-…')
  })
})
