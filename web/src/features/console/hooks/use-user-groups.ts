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
import { useQuery } from '@tanstack/react-query'

import { getUserGroups } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import { HIDDEN_GROUPS, sortGroups } from '../lib/groups'

export type UserGroup = { key: string; desc: string; ratio: number }

/** Groups the current user may create keys in, in display order. */
export function useUserGroups() {
  return useQuery({
    queryKey: ['console', 'user-groups'],
    queryFn: async (): Promise<UserGroup[]> => {
      const response = requireServerSuccess(await getUserGroups())
      const data = response.data ?? {}
      return sortGroups(
        Object.keys(data).filter((key) => !HIDDEN_GROUPS.has(key))
      ).map((key) => ({
        key,
        desc: data[key]?.desc ?? '',
        ratio: Number(data[key]?.ratio ?? 1),
      }))
    },
    staleTime: 60_000,
    meta: { errorToast: false },
  })
}
