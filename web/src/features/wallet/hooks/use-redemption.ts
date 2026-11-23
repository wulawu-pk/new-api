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
import i18next from 'i18next'
import { useState, useCallback } from 'react'
import { toast } from 'sonner'

import { clearPendingRedeemCode } from '@/features/redeem/lib/pending-code'
import { getSelf } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { redeemTopupCode } from '../api'
import { extractRedemptionCode } from '../lib/redemption-code'

// ============================================================================
// Redemption Hook
// ============================================================================

/** Shown when the card was activated but the balance could not be read. */
export const BALANCE_REFRESH_PENDING = 'Your balance will update shortly.'

/** Reads the balance after a redemption; a failure is only a notice. */
export async function refreshBalanceOrNotify(): Promise<number | null> {
  try {
    const self = await getSelf()
    if (self?.success && typeof self.data?.quota === 'number') {
      return self.data.quota
    }
  } catch {
    // fall through to the notice
  }
  toast.info(i18next.t(BALANCE_REFRESH_PENDING))
  return null
}

export function useRedemption() {
  const [redeeming, setRedeeming] = useState(false)

  /**
   * Resolves to the quota added, or 0 when the code was not redeemed. Once
   * the server accepts the code the redemption counts as done: a balance
   * refresh that fails afterwards only shows a notice. Pass
   * `refreshBalance: false` when the caller reads the balance itself.
   */
  const redeemCode = useCallback(
    async (
      input: string,
      options: { refreshBalance?: boolean } = {}
    ): Promise<number> => {
      const code = extractRedemptionCode(input ?? '')
      if (!code) {
        toast.error(
          (input ?? '').trim()
            ? i18next.t('Invalid redemption code format')
            : i18next.t('Please enter a redemption code')
        )
        return 0
      }

      let quotaAdded = 0
      try {
        setRedeeming(true)
        const response = await redeemTopupCode({ key: code })
        if (!response.success || !response.data) {
          handleServerError(response, i18next.t('Redemption failed'))
          return 0
        }
        quotaAdded = response.data
      } catch (error) {
        handleServerError(error, i18next.t('Redemption failed'))
        return 0
      } finally {
        setRedeeming(false)
      }

      // The code is used up; never offer it again.
      clearPendingRedeemCode()
      toast.success(
        i18next.t('Redemption successful! Added: {{quota}}', {
          quota: formatQuota(quotaAdded),
        })
      )
      if (options.refreshBalance !== false) {
        await refreshBalanceOrNotify()
      }
      return quotaAdded
    },
    []
  )

  return {
    redeeming,
    redeemCode,
  }
}
