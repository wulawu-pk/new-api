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
import type { RequestRuleTrace } from '@/features/pricing/lib/billing-expr'

import type { LogOtherData, LogTierPrices } from '../types'

// ----------------------------------------------------------------------------
// Backend-computed tier prices (peroai fork)
// ----------------------------------------------------------------------------
// Usage logs no longer carry the billing expression for customers. The backend
// publishes `other.tier_prices`: the matched tier's unit prices in USD, already
// multiplied by the group ratio the request was settled with. Administrators
// still receive the expression in `admin_info.expr_b64` (new rows) or at the
// top level (rows written before the move).

const TIER_PRICE_UNITS = new Set([
  'token',
  'request',
  'credit',
  'task',
  'usage',
])

function isPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function readPriceMap(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const prices: Record<string, number> = {}
  for (const [key, price] of Object.entries(value)) {
    if (isPrice(price)) prices[key] = price
  }
  return Object.keys(prices).length > 0 ? prices : undefined
}

/** The validated tier_prices of a log, or null when absent or malformed. */
export function readTierPrices(
  other: LogOtherData | null | undefined
): LogTierPrices | null {
  const raw = other?.tier_prices as unknown
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  if (typeof value.unit !== 'string' || !TIER_PRICE_UNITS.has(value.unit)) {
    return null
  }
  const prices: LogTierPrices = {
    unit: value.unit as LogTierPrices['unit'],
  }
  const perMillion = readPriceMap(value.per_million)
  if (perMillion) prices.per_million = perMillion
  const perUnit = readPriceMap(value.per_unit)
  if (perUnit) prices.per_unit = perUnit
  if (isPrice(value.fixed)) prices.fixed = value.fixed
  if (isPrice(value.constant) && value.constant > 0) {
    prices.constant = value.constant
  }
  return prices
}

/** Base64 billing expression visible to the viewer (administrators only). */
export function getLogBillingExprB64(
  other: LogOtherData | null | undefined
): string | undefined {
  return other?.admin_info?.expr_b64 || other?.expr_b64 || undefined
}

/** Request-rule traces visible to the viewer (administrators only). */
export function getLogRequestRules(
  other: LogOtherData | null | undefined
): RequestRuleTrace[] | undefined {
  return other?.admin_info?.request_rules ?? other?.request_rules
}
