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
import { extractRedemptionCode } from '@/features/wallet/lib/redemption-code'

/**
 * Where sign-in and sign-up send the visitor back to. The card code never
 * goes into a URL: it waits in sessionStorage (see savePendingRedeemCode).
 */
export const REDEEM_RETURN_PATH = '/redeem'

export const PENDING_REDEEM_CODE_KEY = 'peroai.redeem.pending'
export const PENDING_REDEEM_CODE_TTL_MS = 10 * 60 * 1000

/** Keeps a code for this tab while the visitor signs in or signs up. */
export function savePendingRedeemCode(input: string): void {
  const code = extractRedemptionCode(input)
  try {
    if (!code) {
      sessionStorage.removeItem(PENDING_REDEEM_CODE_KEY)
      return
    }
    sessionStorage.setItem(
      PENDING_REDEEM_CODE_KEY,
      JSON.stringify({ code, at: Date.now() })
    )
  } catch {
    // Storage disabled: the visitor pastes the code again after signing in.
  }
}

export function clearPendingRedeemCode(): void {
  try {
    sessionStorage.removeItem(PENDING_REDEEM_CODE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Reads the pending code if it is younger than 10 minutes. An expired or
 * unreadable entry is removed. A valid one stays until the page that shows
 * it calls clearPendingRedeemCode (both pages do so once it is in the form).
 */
export function readPendingRedeemCode(): string {
  try {
    const raw = sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)
    if (!raw) return ''
    const saved = JSON.parse(raw) as { code?: unknown; at?: unknown }
    const age = Date.now() - Number(saved.at)
    if (
      typeof saved.code !== 'string' ||
      !(age >= 0 && age < PENDING_REDEEM_CODE_TTL_MS)
    ) {
      clearPendingRedeemCode()
      return ''
    }
    return extractRedemptionCode(saved.code)
  } catch {
    clearPendingRedeemCode()
    return ''
  }
}

/** Code from a legacy `?code=` link or a `#code=` fragment. */
export function redeemCodeFromLocation(
  searchCode: string | undefined,
  hash: string
): string {
  if (searchCode) return searchCode
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  return new URLSearchParams(fragment).get('code') ?? ''
}
