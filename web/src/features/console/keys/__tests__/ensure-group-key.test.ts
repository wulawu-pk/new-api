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
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as keysApi from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'

import { buildCreateKeyPayload } from '../lib/create-key'
import { ensureGroupKey } from '../lib/create-key-flow'

vi.mock('@/features/keys/api', () => ({
  getApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  fetchTokenKey: vi.fn(),
}))

function key(id: number, name: string, group: string, status = 1): ApiKey {
  return {
    id,
    name,
    key: 'pMH8**********03Sb',
    status,
    remain_quota: 0,
    used_quota: 0,
    unlimited_quota: true,
    expired_time: -1,
    created_time: 0,
    accessed_time: 0,
    group,
    auto_groups: null,
    cross_group_retry: false,
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
    allow_user_quota_query: false,
  }
}

function list(items: ApiKey[]) {
  return {
    success: true,
    message: '',
    data: { items, total: items.length, page: 1, page_size: 100 },
  } as never
}

const PAYLOAD = buildCreateKeyPayload({
  name: 'claude-code',
  group: 'claude-kiro',
  limit: '',
  expiry: 'never',
})

afterEach(() => vi.clearAllMocks())

describe('ensureGroupKey', () => {
  it('creates nothing when an enabled key already exists in the group', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(
      list([key(3, 'zy-claude', 'claude-kiro')])
    )

    const result = await ensureGroupKey(PAYLOAD, 'failed')

    expect(result).toEqual({ created: false, name: 'zy-claude' })
    expect(keysApi.createApiKey).not.toHaveBeenCalled()
  })

  it('creates a key when the only key in the group is disabled', async () => {
    vi.mocked(keysApi.getApiKeys)
      .mockResolvedValueOnce(list([key(3, 'old', 'claude-kiro', 2)]))
      .mockResolvedValueOnce(
        list([
          key(9, 'claude-code', 'claude-kiro'),
          key(3, 'old', 'claude-kiro', 2),
        ])
      )
    vi.mocked(keysApi.createApiKey).mockResolvedValue({
      success: true,
    } as never)
    vi.mocked(keysApi.fetchTokenKey).mockResolvedValue({
      success: true,
      data: { key: 'abc' },
    } as never)

    const result = await ensureGroupKey(PAYLOAD, 'failed')

    expect(result).toEqual({ created: true, name: 'claude-code' })
    expect(keysApi.createApiKey).toHaveBeenCalledWith(PAYLOAD)
  })

  it('creates a key when existing keys are in other groups', async () => {
    vi.mocked(keysApi.getApiKeys)
      .mockResolvedValueOnce(list([key(4, 'codex', 'gpt-pro')]))
      .mockResolvedValueOnce(
        list([key(9, 'claude-code', 'claude-kiro'), key(4, 'codex', 'gpt-pro')])
      )
    vi.mocked(keysApi.createApiKey).mockResolvedValue({
      success: true,
    } as never)
    vi.mocked(keysApi.fetchTokenKey).mockResolvedValue({
      success: true,
      data: { key: 'abc' },
    } as never)

    const result = await ensureGroupKey(PAYLOAD, 'failed')

    expect(result.created).toBe(true)
    expect(keysApi.createApiKey).toHaveBeenCalledTimes(1)
  })
})
