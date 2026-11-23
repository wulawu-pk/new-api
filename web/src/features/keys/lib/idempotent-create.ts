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
import axios from 'axios'

import { createApiKey } from '../api'
import type { ApiKeyFormData, ApiResponse } from '../types'

/** What POST /api/token/ accepts as `client_request_id`. */
export const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

/**
 * A fresh id for one create click. The server answers a repeated id (same
 * user, within 10 minutes) with the key it made the first time instead of
 * creating another.
 */
export function newClientRequestId(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID().replaceAll('-', '')
  }
  const bytes = new Uint8Array(16)
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** No answer reached us: the key may or may not exist on the server. */
export function isNetworkFailure(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response
}

export type IdempotentCreateOptions = {
  /** Reuse an id; by default each call is one new create click. */
  clientRequestId?: string
  /** Total tries when no answer arrives (network failure). */
  attempts?: number
  retryDelayMs?: number
}

/**
 * POST /api/token/ with a `client_request_id`. When the request fails
 * without an answer (the key may have been created anyway), it is sent again
 * with the same id, so the server returns that key instead of a second one.
 * Server answers (success or not) are returned as they are.
 */
export async function createApiKeyOnce(
  payload: ApiKeyFormData,
  options: IdempotentCreateOptions = {}
): Promise<ApiResponse<{ id: number; name: string }>> {
  const clientRequestId = options.clientRequestId ?? newClientRequestId()
  const attempts = Math.max(1, options.attempts ?? 3)
  const delay = options.retryDelayMs ?? 500
  const body = { ...payload, client_request_id: clientRequestId }
  for (let attempt = 1; ; attempt++) {
    try {
      return await createApiKey(body)
    } catch (error) {
      if (!isNetworkFailure(error) || attempt >= attempts) throw error
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay * attempt))
      }
    }
  }
}
