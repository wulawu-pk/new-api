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
import type { LogOtherData, LogTierPrices } from '@/features/usage-logs/types'

/**
 * How a successful request was billed, for the console log detail. Credit
 * billing is read separately (`credit-billing.ts`); this covers the rest:
 * images are billed per image, video tasks per second (or per clip), flat
 * per-call models per request, everything else per token.
 */
export type LogBilling =
  | {
      kind: 'image'
      /** Size tier, e.g. "1K". */
      tier: string
      /** Requested size, e.g. "1024x1024". */
      size: string
      count: number | null
      /** USD per image, group ratio included. */
      unitPriceUSD: number | null
    }
  | {
      kind: 'seconds'
      seconds: number | null
      /** USD per second, group ratio included. */
      unitPriceUSD: number | null
    }
  | {
      kind: 'request'
      /** USD per request, group ratio included. */
      unitPriceUSD: number | null
    }
  | { kind: 'token' }

function positive(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

function contentParam(
  other: LogOtherData,
  key: string,
  param: string
): string | number | boolean | undefined {
  return other.content_parts?.find((part) => part.key === key)?.params?.[param]
}

/**
 * Per-unit price of a flat-priced request: the backend's tier price when it
 * was published, else the logged unit price times the settled group ratio.
 */
function flatUnitPrice(
  other: LogOtherData,
  prices: LogTierPrices | null,
  groupRatio: number | null
): number | null {
  if (prices?.unit === 'request' && prices.fixed !== undefined) {
    return prices.fixed
  }
  const ratio = groupRatio ?? 1
  const fixed = positive(other.fixed_price)
  if (fixed != null) return fixed * ratio
  const modelPrice = positive(other.model_price)
  if (modelPrice != null) return modelPrice * ratio
  return null
}

export function getLogBilling(
  other: LogOtherData | null,
  prices: LogTierPrices | null,
  groupRatio: number | null
): LogBilling {
  if (!other) return { kind: 'token' }

  const isImage =
    other.image_count !== undefined ||
    /\/images\//.test(other.request_path ?? '')
  if (isImage) {
    const size = contentParam(other, 'Size {{size}}', 'size')
    return {
      kind: 'image',
      tier: other.matched_tier ?? '',
      size: typeof size === 'string' ? size : '',
      count:
        positive(other.image_count) ??
        positive(contentParam(other, 'Image count {{count}}', 'count')),
      unitPriceUSD: flatUnitPrice(other, prices, groupRatio),
    }
  }

  const isTask = other.is_task === true || prices?.unit === 'task'
  if (isTask) {
    const seconds = positive(other.usage_facts?.seconds)
    const perSecond = prices?.per_unit?.seconds
    if (seconds != null || perSecond !== undefined) {
      return {
        kind: 'seconds',
        seconds,
        unitPriceUSD: perSecond ?? null,
      }
    }
    return { kind: 'request', unitPriceUSD: prices?.constant ?? null }
  }

  if (other.billing_unit === 'request' || positive(other.model_price) != null) {
    return {
      kind: 'request',
      unitPriceUSD: flatUnitPrice(other, prices, groupRatio),
    }
  }
  return { kind: 'token' }
}
