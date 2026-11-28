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
import { useTranslation } from 'react-i18next'

import { formatCredits } from '@/features/usage-logs/lib/credit-billing'
import { toIntlLocale } from '@/i18n/languages'
import { formatLogQuota, formatNumber } from '@/lib/format'

import type { ConsoleLogRow } from '../lib/log-row'

type Cell = { label: string; value: string }

function usd(value: number): string {
  return `$${Number(value.toPrecision(6))}`
}

/**
 * Billing breakdown shown when a log row is expanded. `showChannel` (the
 * admin all-users view) adds the diagnostics that stay admin-only: the client's
 * User-Agent and the channel that served the request.
 */
export function LogDetail(props: {
  row: ConsoleLogRow
  showChannel?: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const row = props.row
  const num = (n: number) => formatNumber(n, locale)
  const seconds = (n: number | null) =>
    n == null ? '—' : `${Number(n.toFixed(2))} s`

  let cells: Cell[]
  if (row.isError) {
    cells = [
      { label: t('Result'), value: t('Failed') },
      { label: t('Total time'), value: seconds(row.useTime) },
      { label: t('Charge'), value: formatLogQuota(row.quota) },
    ]
  } else if (row.credit) {
    cells = [
      { label: t('Billing'), value: t('By credit') },
      {
        label: t('Consumed'),
        value:
          row.credit.credits == null
            ? '—'
            : `${formatCredits(row.credit.credits)} credit`,
      },
      {
        label: t('Unit price'),
        value:
          row.credit.unitPriceUSD == null
            ? '—'
            : `${usd(row.credit.unitPriceUSD)} / credit`,
      },
      { label: t('Charge'), value: formatLogQuota(row.quota) },
      { label: t('Input'), value: num(row.input) },
      { label: t('Cache read'), value: num(row.cacheRead) },
      { label: t('Cache write'), value: num(row.cacheWrite) },
      { label: t('Output'), value: num(row.output) },
      { label: t('Time to first token'), value: seconds(row.firstToken) },
    ]
  } else if (row.billing.kind === 'image') {
    const billing = row.billing
    const tier = [billing.tier, billing.size].filter(Boolean).join(' · ')
    cells = [{ label: t('Billing'), value: t('By image') }]
    if (tier) cells.push({ label: t('Size'), value: tier })
    cells.push({
      label: t('Images'),
      value: billing.count == null ? '—' : num(billing.count),
    })
    if (billing.unitPriceUSD != null) {
      cells.push({
        label: t('Unit price'),
        value: `${usd(billing.unitPriceUSD)} / ${t('image')}`,
      })
    }
    cells.push(
      { label: t('Charge'), value: formatLogQuota(row.quota) },
      { label: t('Total time'), value: seconds(row.useTime) }
    )
  } else if (row.billing.kind === 'seconds') {
    const billing = row.billing
    cells = [
      { label: t('Billing'), value: t('By second') },
      {
        label: t('Video length'),
        value: billing.seconds == null ? '—' : seconds(billing.seconds),
      },
    ]
    if (billing.unitPriceUSD != null) {
      cells.push({
        label: t('Unit price'),
        value: `${usd(billing.unitPriceUSD)} / s`,
      })
    }
    cells.push({ label: t('Charge'), value: formatLogQuota(row.quota) })
  } else if (row.billing.kind === 'request') {
    const billing = row.billing
    cells = [{ label: t('Billing'), value: t('By request') }]
    if (billing.unitPriceUSD != null) {
      cells.push({
        label: t('Unit price'),
        value: `${usd(billing.unitPriceUSD)} / ${t('call')}`,
      })
    }
    cells.push(
      { label: t('Charge'), value: formatLogQuota(row.quota) },
      { label: t('Total time'), value: seconds(row.useTime) }
    )
  } else {
    const perMillion = row.tierPrices?.per_million
    cells = [
      { label: t('Billing'), value: t('By token') },
      { label: t('Input'), value: num(row.input) },
      { label: t('Of which cache read'), value: num(row.cacheRead) },
    ]
    if (row.cacheWrite > 0) {
      cells.push({ label: t('Cache write'), value: num(row.cacheWrite) })
    }
    cells.push({ label: t('Output'), value: num(row.output) })
    if (perMillion?.p != null) {
      cells.push({
        label: t('Input price'),
        value: `${usd(perMillion.p)} / 1M`,
      })
    }
    if (perMillion?.c != null) {
      cells.push({
        label: t('Output price'),
        value: `${usd(perMillion.c)} / 1M`,
      })
    }
    if (!perMillion && row.groupRatio != null) {
      cells.push({
        label: t('Group ratio'),
        value: `×${Number(row.groupRatio.toFixed(4))}`,
      })
    }
    cells.push(
      { label: t('Charge'), value: formatLogQuota(row.quota) },
      { label: t('Time to first token'), value: seconds(row.firstToken) },
      { label: t('Total time'), value: seconds(row.useTime) }
    )
  }

  if (row.reasoningEffort) {
    cells.push({ label: t('Thinking effort'), value: row.reasoningEffort })
  }

  if (row.endpoint) {
    cells.push({ label: t('Endpoint'), value: row.endpoint })
  }

  // Admin-only, like the channel: the backend records the User-Agent in
  // admin_info, so an ordinary customer's own view never carries it.
  if (props.showChannel && row.userAgent) {
    cells.push({ label: t('UserAgent'), value: row.userAgent })
  }

  if (props.showChannel && row.channel > 0) {
    cells.push({
      label: t('Channel'),
      value: row.channelName
        ? `#${row.channel} ${row.channelName}`
        : `#${row.channel}`,
    })
  }

  return (
    <div>
      <div className='grid grid-cols-4 gap-x-6 gap-y-1 text-[13px] leading-[1.9] max-md:grid-cols-2'>
        {cells.map((cell) => (
          <div key={cell.label}>
            <b className='text-t-dim block text-xs font-medium'>{cell.label}</b>
            <span className='text-t-fg2 font-mono break-all'>{cell.value}</span>
          </div>
        ))}
      </div>
      {row.isError && row.content && (
        <p className='text-t-fg2 mt-2 text-[13px] leading-[1.7] break-words'>
          <span className='text-t-warn font-mono'>! </span>
          {row.content}
        </p>
      )}
    </div>
  )
}
