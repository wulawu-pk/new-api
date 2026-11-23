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
import { AxiosError } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as keysApi from '@/features/keys/api'
import {
  CLIENT_REQUEST_ID_PATTERN,
  newClientRequestId,
} from '@/features/keys/lib/idempotent-create'
import type { ApiKey } from '@/features/keys/types'

import { buildCreateKeyPayload } from '../lib/create-key'
import {
  KeyRevealError,
  createKeyAndFetch,
  ensureGroupKey,
} from '../lib/create-key-flow'

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
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(
      list([key(3, 'old', 'claude-kiro', 2)])
    )
    vi.mocked(keysApi.createApiKey).mockResolvedValue({
      success: true,
      data: { id: 9, name: 'claude-code' },
    })

    const result = await ensureGroupKey(PAYLOAD, 'failed')

    expect(result).toEqual({ created: true, name: 'claude-code' })
    expect(keysApi.createApiKey).toHaveBeenCalledWith({
      ...PAYLOAD,
      client_request_id: expect.stringMatching(CLIENT_REQUEST_ID_PATTERN),
    })
    // Only the name is needed: the full key is never read here, and the
    // list is read once (to look for an existing key), not to find the id.
    expect(keysApi.fetchTokenKey).not.toHaveBeenCalled()
    expect(keysApi.getApiKeys).toHaveBeenCalledTimes(1)
  })

  it('creates a key when existing keys are in other groups', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(
      list([key(4, 'codex', 'gpt-pro')])
    )
    vi.mocked(keysApi.createApiKey).mockResolvedValue({
      success: true,
      data: { id: 9, name: 'claude-code' },
    })

    const result = await ensureGroupKey(PAYLOAD, 'failed')

    expect(result.created).toBe(true)
    expect(keysApi.createApiKey).toHaveBeenCalledTimes(1)
  })

  it('creates a key when the list cannot be read', async () => {
    vi.mocked(keysApi.getApiKeys).mockResolvedValue({
      success: false,
      message: 'nope',
    } as never)
    vi.mocked(keysApi.createApiKey).mockResolvedValue({
      success: true,
      data: { id: 9, name: 'claude-code' },
    })

    expect((await ensureGroupKey(PAYLOAD, 'failed')).created).toBe(true)
  })

  it('creates a key that never expires and has no spending cap', () => {
    expect(PAYLOAD).toMatchObject({
      expired_time: -1,
      unlimited_quota: true,
      remain_quota: 0,
      group: 'claude-kiro',
    })
  })
})

describe('createKeyAndFetch', () => {
  it('reads the full key by the id the create call returned', async () => {
    vi.mocked(keysApi.createApiKey).mockResolvedValue({
      success: true,
      data: { id: 12, name: 'claude-code' },
    })
    vi.mocked(keysApi.fetchTokenKey).mockResolvedValue({
      success: true,
      data: { key: 'abc' },
    })

    expect(await createKeyAndFetch(PAYLOAD, 'failed')).toEqual({
      id: 12,
      name: 'claude-code',
      key: 'sk-abc',
    })
    expect(keysApi.fetchTokenKey).toHaveBeenCalledWith(12)
    expect(keysApi.getApiKeys).not.toHaveBeenCalled()
  })

  it('fails instead of guessing by name when the server returns no id', async () => {
    vi.mocked(keysApi.createApiKey).mockResolvedValue({ success: true })
    vi.mocked(keysApi.getApiKeys).mockResolvedValue(
      list([key(9, 'claude-code', 'claude-kiro')])
    )

    await expect(createKeyAndFetch(PAYLOAD, 'failed')).rejects.toThrow('failed')
    expect(keysApi.getApiKeys).not.toHaveBeenCalled()
    expect(keysApi.fetchTokenKey).not.toHaveBeenCalled()
  })

  it('fails on an id that is not a positive integer', async () => {
    vi.mocked(keysApi.createApiKey).mockResolvedValue({
      success: true,
      data: { id: 0, name: 'claude-code' },
    })
    await expect(createKeyAndFetch(PAYLOAD, 'failed')).rejects.toThrow('failed')
  })

  it('reports a created key whose value could not be read, with its id', async () => {
    vi.mocked(keysApi.createApiKey).mockResolvedValue({
      success: true,
      data: { id: 12, name: 'claude-code' },
    })
    vi.mocked(keysApi.fetchTokenKey).mockResolvedValue({
      success: false,
      message: 'busy',
    })
    const onCreated = vi.fn()

    const error = await createKeyAndFetch(PAYLOAD, 'failed', onCreated).catch(
      (e: unknown) => e
    )

    expect(error).toBeInstanceOf(KeyRevealError)
    expect(error).toMatchObject({ id: 12, keyName: 'claude-code' })
    expect(onCreated).toHaveBeenCalledWith({ id: 12, name: 'claude-code' })
    expect(keysApi.createApiKey).toHaveBeenCalledTimes(1)
  })
})

describe('idempotent key creation', () => {
  const offline = () =>
    new AxiosError('Network Error', 'ERR_NETWORK', { headers: {} } as never)

  it('makes ids the server accepts, a new one each time', () => {
    const ids = new Set(Array.from({ length: 20 }, newClientRequestId))
    expect(ids.size).toBe(20)
    for (const id of ids) expect(id).toMatch(CLIENT_REQUEST_ID_PATTERN)
  })

  it('retries a create whose answer was lost with the same client_request_id', async () => {
    // The server created the key, but the answer never arrived.
    vi.mocked(keysApi.createApiKey)
      .mockRejectedValueOnce(offline())
      .mockResolvedValueOnce({
        success: true,
        data: { id: 12, name: 'claude-code' },
      })
    vi.mocked(keysApi.fetchTokenKey).mockResolvedValue({
      success: true,
      data: { key: 'abc' },
    })

    const created = await createKeyAndFetch(PAYLOAD, 'failed', undefined, {
      retryDelayMs: 0,
    })

    expect(created).toEqual({ id: 12, name: 'claude-code', key: 'sk-abc' })
    const calls = vi.mocked(keysApi.createApiKey).mock.calls
    expect(calls).toHaveLength(2)
    const first = calls[0][0].client_request_id
    expect(first).toMatch(CLIENT_REQUEST_ID_PATTERN)
    expect(calls[1][0].client_request_id).toBe(first)
  })

  it('uses a new id for the next create click', async () => {
    vi.mocked(keysApi.createApiKey).mockResolvedValue({
      success: true,
      data: { id: 12, name: 'claude-code' },
    })
    vi.mocked(keysApi.fetchTokenKey).mockResolvedValue({
      success: true,
      data: { key: 'abc' },
    })

    await createKeyAndFetch(PAYLOAD, 'failed')
    await createKeyAndFetch(PAYLOAD, 'failed')

    const [first, second] = vi
      .mocked(keysApi.createApiKey)
      .mock.calls.map(([body]) => body.client_request_id)
    expect(first).not.toBe(second)
  })

  it('does not retry a request the server answered', async () => {
    vi.mocked(keysApi.createApiKey).mockResolvedValue({
      success: false,
      message: 'group not allowed',
    })

    await expect(
      createKeyAndFetch(PAYLOAD, 'failed', undefined, { retryDelayMs: 0 })
    ).rejects.toThrow()
    expect(keysApi.createApiKey).toHaveBeenCalledTimes(1)
  })

  it('gives up after three tries without an answer', async () => {
    vi.mocked(keysApi.createApiKey).mockRejectedValue(offline())

    await expect(
      createKeyAndFetch(PAYLOAD, 'failed', undefined, { retryDelayMs: 0 })
    ).rejects.toThrow('Network Error')
    const ids = vi
      .mocked(keysApi.createApiKey)
      .mock.calls.map(([body]) => body.client_request_id)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(1)
  })
})
