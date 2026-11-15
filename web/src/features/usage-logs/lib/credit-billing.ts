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
import { readCreditUnitPriceFromExpression } from '@/features/pricing/lib/special-price'

import type { LogOtherData } from '../types'
import { decodeBillingExprB64 } from './format'

// ----------------------------------------------------------------------------
// Credit-billed requests in usage logs (peroai fork)
// ----------------------------------------------------------------------------
// A kiro request settles on the `credit` tier of
// `u("provider") == "kiro" ? tier("credit", u("credits") * X * 1e6) : …`.
// Its group multiplier alone (×1.85) tells the customer nothing, so the log
// quotes what they were actually charged for: the credits the upstream
// reported and the price of one credit (X × group ratio), the same
// "$0.25 / credit" the model square and key pages show.

const DEFAULT_QUOTA_PER_UNIT = 500000

export type CreditBillingSummary = {
  /** USD price of one credit after the group multiplier. */
  unitPriceUSD: number
  /** Upstream-reported credits, or derived from the charged quota. */
  credits: number | null
}

function effectiveGroupRatio(other: LogOtherData): number {
  const user = other.user_group_ratio
  if (user != null && user !== -1 && Number.isFinite(user)) return user
  const group = other.group_ratio
  return group != null && Number.isFinite(group) ? group : 1
}

/**
 * Credit billing facts of a consume log, or null when the request was not
 * settled on a credit tier (token-billed groups, the kiro expression's token
 * fallback, or an expression whose credit price cannot be read).
 */
export function getCreditBillingSummary(
  other: LogOtherData | null | undefined,
  quota: number,
  quotaPerUnit = DEFAULT_QUOTA_PER_UNIT
): CreditBillingSummary | null {
  if (!other || other.billing_mode !== 'tiered_expr') return null
  if ((other.matched_tier || '').trim().toLowerCase() !== 'credit') return null
  const rate = readCreditUnitPriceFromExpression(
    decodeBillingExprB64(other.expr_b64)
  )
  if (rate === null) return null
  const unitPriceUSD = rate * effectiveGroupRatio(other)
  if (!(unitPriceUSD > 0)) return null

  let credits: number | null = null
  if (typeof other.credits === 'number' && Number.isFinite(other.credits)) {
    credits = other.credits
  } else if (Number.isFinite(quota) && quota >= 0 && quotaPerUnit > 0) {
    // Logs written before the backend recorded credits: invert the charge.
    credits = quota / quotaPerUnit / unitPriceUSD
  }
  return { unitPriceUSD, credits }
}

/** Credits rounded for display; upstream reports up to ~7 significant digits. */
export function formatCredits(credits: number): string {
  return Number(credits.toPrecision(6)).toString()
}
