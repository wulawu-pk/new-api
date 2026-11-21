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
import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { LoadErrorText, SkeletonText } from '@/components/terminal/data-states'
import { errorReason } from '@/components/terminal/lib'
import { Pane } from '@/components/terminal/pane'
import type { UserProfile } from '@/features/profile/types'

import { SELF_USER_QUERY_KEY, useSelfUser } from '../../hooks/use-self-user'

/**
 * Loads the signed-in user for an account page and shows the loading /
 * error states in a pane; renders `children` with the user once loaded.
 * `refresh` re-reads the user (the shell's balance shares the same query).
 */
export function AccountLoader(props: {
  title: string
  children: (profile: UserProfile, refresh: () => void) => ReactNode
}) {
  const queryClient = useQueryClient()
  const self = useSelfUser()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: SELF_USER_QUERY_KEY })
  }

  if (self.data) return props.children(self.data, refresh)
  if (self.isError) {
    return (
      <Pane title={<b>{props.title}</b>}>
        <LoadErrorText
          className='p-5'
          api='/api/user/self'
          reason={errorReason(self.error)}
          onRetry={() => void self.refetch()}
        />
      </Pane>
    )
  }
  return (
    <Pane title={<b>{props.title}</b>}>
      <div className='p-6' role='status' aria-busy='true'>
        <SkeletonText width={16} />
      </div>
    </Pane>
  )
}
