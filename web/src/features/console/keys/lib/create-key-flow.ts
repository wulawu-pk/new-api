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
import { createApiKey, fetchTokenKey, getApiKeys } from '@/features/keys/api'
import type { ApiKeyFormData } from '@/features/keys/types'
import { createServerError } from '@/lib/server-error-message'

export type CreatedKey = { id: number; name: string; key: string }

/** Full `sk-` key from the unmasked value the server returns. */
export function withSkPrefix(key: string): string {
  return key.startsWith('sk-') ? key : `sk-${key}`
}

/**
 * Creates a key and returns the id and name POST /api/token/ answers with.
 * A response without an id (an older server) is an error: picking the key
 * out of the list by name could hand back a different key.
 */
export async function createKey(
  payload: ApiKeyFormData,
  fallbackError: string
): Promise<{ id: number; name: string }> {
  const created = await createApiKey(payload)
  if (!created.success) throw createServerError(created, fallbackError)
  const id = created.data?.id
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error(fallbackError)
  }
  const name = created.data?.name
  return { id, name: typeof name === 'string' && name ? name : payload.name }
}

/** Creates a key, then reads its full value through POST /api/token/:id/key. */
export async function createKeyAndFetch(
  payload: ApiKeyFormData,
  fallbackError: string
): Promise<CreatedKey> {
  const made = await createKey(payload, fallbackError)
  const reveal = await fetchTokenKey(made.id)
  if (!reveal.success || !reveal.data?.key) {
    throw createServerError(reveal, fallbackError)
  }
  return { ...made, key: withSkPrefix(reveal.data.key) }
}

/** 1 = enabled (2 disabled, 3 expired, 4 exhausted). */
const KEY_ENABLED = 1

/**
 * The automatic key for a landing-page plan: a key only depends on its group
 * (any model in the group works with it), so when the user already has an
 * enabled key in that group nothing is created. Otherwise one key is made.
 * Only the first 100 keys are checked; if the list cannot be read, a key is
 * created as before.
 */
export async function ensureGroupKey(
  payload: ApiKeyFormData,
  fallbackError: string
): Promise<{ created: boolean; name: string }> {
  const list = await getApiKeys({ p: 1, size: 100 })
  const existing = list.success
    ? (list.data?.items ?? []).find(
        (item) => item.group === payload.group && item.status === KEY_ENABLED
      )
    : undefined
  if (existing) return { created: false, name: existing.name }
  // Only the name is shown; the full key value is not read here.
  const made = await createKey(payload, fallbackError)
  return { created: true, name: made.name }
}
