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
import type { UsageLog } from '@/features/usage-logs/data/schema'
import { parseLogOther } from '@/features/usage-logs/lib/format'
import { getCoinOfPaymentMethod } from '@/features/wallet/lib/payment'
import type { TopupRecord, TopupStatus } from '@/features/wallet/types'

/** One row of the wallet's top-up history (orders and redeemed codes). */
export type WalletHistoryRow = {
  id: string
  time: number
  kind: 'order' | 'code'
  /** Payment method of an order, e.g. `usdt.bsc`. */
  method: string
  /** Coin of a coin-priced order. */
  coin?: string
  /** Paid amount of an order (coins or money). */
  paid?: number
  /** Credited quota of a coin-priced order. */
  creditQuota?: number
  /** Credited USD of a redeemed code or a classic order. */
  creditUSD?: number
  status: TopupStatus
}

const REDEEM_KEY = 'Topped up {{quota}} with a redemption code, code ID {{id}}'

type ContentPart = { key?: string; params?: Record<string, unknown> }

/** Amount in a formatted backend quota such as `＄200.000000` or `$1.5`. */
function parseUSD(text: unknown): number | undefined {
  if (typeof text !== 'string') return undefined
  const value = Number(text.replaceAll(/[^0-9.]/g, ''))
  return Number.isFinite(value) ? value : undefined
}

/** A redeemed-code row from a top-up log, or null for other top-up logs. */
export function redeemRowFromLog(log: UsageLog): WalletHistoryRow | null {
  const other = parseLogOther(log.other) as
    | (ReturnType<typeof parseLogOther> & { content_parts?: ContentPart[] })
    | null
  const part = other?.content_parts?.find((item) => item.key === REDEEM_KEY)
  if (!part) return null
  return {
    id: `log-${log.id}`,
    time: log.created_at,
    kind: 'code',
    method: 'redemption',
    creditUSD: parseUSD(part.params?.quota),
    status: 'success',
  }
}

export function orderRow(record: TopupRecord): WalletHistoryRow {
  const coin = getCoinOfPaymentMethod(record.payment_method)
  return {
    id: `order-${record.id}`,
    time: record.create_time,
    kind: 'order',
    method: record.payment_method,
    coin,
    paid: record.money,
    creditQuota: record.credit_quota || undefined,
    creditUSD: record.credit_quota ? undefined : record.amount,
    status: record.status,
  }
}

/** Orders and redeemed codes, newest first. */
export function mergeHistory(
  records: TopupRecord[],
  logs: UsageLog[]
): WalletHistoryRow[] {
  const rows = [
    ...records.map(orderRow),
    ...logs
      .map(redeemRowFromLog)
      .filter((row): row is WalletHistoryRow => row != null),
  ]
  return rows.sort((a, b) => b.time - a.time)
}

/** `usdt.bsc` → `USDT · BSC`; other methods keep their configured name. */
export function methodLabel(method: string, configuredName?: string): string {
  const [coin, network] = method.split('.')
  if (network && (coin === 'usdt' || coin === 'usdc')) {
    return `${coin.toUpperCase()} · ${network.toUpperCase()}`
  }
  return configuredName || method
}
