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
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { usePasskeyManagement } from '@/features/auth/passkey'
import { useSecureVerification } from '@/features/auth/secure-verification'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'

/**
 * Passkey status plus register / remove actions. Both actions first ask the
 * server for a fresh identity proof (password, 2FA or an existing Passkey)
 * through the secure verification dialog; render `verification.dialogProps`
 * with `SecureVerificationDialog`. Shared by the security page card and the
 * console account page.
 */
export function usePasskeyActions() {
  const { t } = useTranslation()
  const management = usePasskeyManagement()
  const verification = useSecureVerification()
  const busy =
    management.registering || management.removing || verification.isActive

  const register = useCallback(async () => {
    if (busy) return
    const proof = await verification.requestVerification({
      scope: 'passkey.register',
    })
    if (!proof) return
    try {
      await management.register(proof.proof_token)
      toast.success(t('Passkey registered successfully'))
    } catch (error) {
      const failure = AuthOperationError.from(error)
      if (failure.code !== 'AUTH_CANCELLED') handleServerError(failure)
    }
  }, [busy, management, t, verification])

  const remove = useCallback(async () => {
    if (busy) return
    const proof = await verification.requestVerification({
      scope: 'passkey.delete',
    })
    if (!proof) return
    try {
      await management.remove(proof.proof_token)
      toast.success(t('Passkey removed successfully'))
    } catch (error) {
      const failure = AuthOperationError.from(error)
      if (failure.code !== 'AUTH_CANCELLED') handleServerError(failure)
    }
  }, [busy, management, t, verification])

  return { ...management, verification, register, remove }
}
