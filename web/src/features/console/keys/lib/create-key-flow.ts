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
 * Creates a key, then reads it back. POST /api/token/ returns no id, so the
 * newest key with the same name is taken from the first page of the list and
 * its full value fetched through POST /api/token/:id/key.
 */
export async function createKeyAndFetch(
  payload: ApiKeyFormData,
  fallbackError: string
): Promise<CreatedKey> {
  const created = await createApiKey(payload)
  if (!created.success) throw createServerError(created, fallbackError)

  const list = await getApiKeys({ p: 1, size: 20 })
  if (!list.success) throw createServerError(list, fallbackError)
  const match = (list.data?.items ?? [])
    .filter((item) => item.name === payload.name)
    .sort((a, b) => b.id - a.id)[0]
  if (!match) throw new Error(fallbackError)

  const reveal = await fetchTokenKey(match.id)
  if (!reveal.success || !reveal.data?.key) {
    throw createServerError(reveal, fallbackError)
  }
  return { id: match.id, name: match.name, key: withSkPrefix(reveal.data.key) }
}
