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
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import { consumePendingPlan } from '../auth/lib/pending-plan'
import { autoKeyName, buildCreateKeyPayload } from '../keys/lib/create-key'
import { createKeyAndFetch } from '../keys/lib/create-key-flow'
import { groupName } from '../lib/groups'

/**
 * After the first sign-in that carries a landing-page plan (sign-up, sign-in,
 * or the MFA step in between), create one key in the chosen group, then
 * show the key list. The server validates the group.
 */
export function usePlanKey(): void {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const signedIn = useAuthStore((state) => Boolean(state.auth.user))
  const started = useRef(false)

  useEffect(() => {
    if (!signedIn || started.current) return
    const plan = consumePendingPlan()
    if (!plan) return
    started.current = true
    const name = autoKeyName(plan.client, plan.group)
    const payload = buildCreateKeyPayload({
      name,
      group: plan.group,
      limit: '',
      expiry: 'never',
    })
    void createKeyAndFetch(payload, t('Failed to create key'))
      .then(() => {
        toast.success(
          t('Created a key in the 「{{group}}」 group', {
            group: groupName(plan.group, t),
          })
        )
        void queryClient.invalidateQueries({ queryKey: ['console'] })
        void navigate({ to: '/keys' })
      })
      .catch((error: unknown) =>
        handleServerError(error, t('Failed to create key'))
      )
  }, [signedIn, t, navigate, queryClient])
}
