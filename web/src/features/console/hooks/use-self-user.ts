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

import { getUserProfile } from '@/features/profile/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

export const SELF_USER_QUERY_KEY = ['console', 'self-user'] as const

/**
 * Current user (balance, used quota, request count) for the console shell
 * and overview. Only runs when signed in.
 */
export function useSelfUser() {
  const signedIn = useAuthStore((state) => Boolean(state.auth.user))
  return useQuery({
    queryKey: SELF_USER_QUERY_KEY,
    queryFn: async () => {
      const response = requireServerSuccess(await getUserProfile())
      return response.data ?? null
    },
    enabled: signedIn,
    staleTime: 30_000,
    meta: { errorToast: false },
  })
}
