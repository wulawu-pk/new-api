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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  formatLatency,
  formatThroughput,
  formatUptimePct,
  getSuccessRateDotClass,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { translateServerText } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { toSparklineSeries, type GroupSparklinePoint } from '../lib/health'
import type { GroupHealthSummary } from '../types'
import { GroupSparkline } from './group-sparkline'

function Metric(props: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className='flex min-w-0 flex-col gap-1'>
      <dt className='text-muted-foreground truncate text-[11px] leading-4'>
        {props.label}
      </dt>
      <dd
        className='font-ascii text-sm font-medium tabular-nums'
        title={props.hint}
      >
        {props.value}
      </dd>
    </div>
  )
}

/**
 * One model group on the status board: name and window success rate, an
 * hourly uptime strip whose hovered slot replaces the headline figure, then
 * the latency, throughput and volume numbers for the window.
 */
export function GroupHealthCard(props: {
  summary: GroupHealthSummary
  description?: string
  modelCount?: number
}) {
  const { t, i18n } = useTranslation()
  const [active, setActive] = useState<GroupSparklinePoint | null>(null)
  const summary = props.summary
  const samples = toSparklineSeries(summary.series)
  const label = props.description
    ? translateServerText(t, props.description)
    : summary.group
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const activeTime = active
    ? new Date(active.ts * 1000).toLocaleString(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

  return (
    <section
      aria-label={t('Health of group {{group}}', { group: summary.group })}
      className='flex flex-col gap-4 px-5 py-5 sm:px-6'
    >
      <header className='flex min-w-0 items-start justify-between gap-4'>
        <div className='flex min-w-0 items-start gap-3'>
          <span
            aria-hidden
            className={cn(
              'mt-1.5 size-2 shrink-0 rounded-full',
              getSuccessRateDotClass(summary.success_rate)
            )}
          />
          <div className='min-w-0'>
            <h2
              className='truncate text-base leading-snug font-semibold'
              title={label}
            >
              {label}
            </h2>
            {label !== summary.group && (
              <p className='font-ascii text-muted-foreground mt-0.5 truncate text-xs'>
                {summary.group}
              </p>
            )}
          </div>
        </div>

        {/* Both readouts share one grid cell so hovering never shifts layout. */}
        <div className='grid shrink-0 justify-items-end text-right'>
          <div
            aria-hidden={active !== null}
            className={cn(
              'col-start-1 row-start-1 flex flex-col items-end gap-1',
              active && 'invisible'
            )}
          >
            <span
              className={cn(
                'font-ascii text-lg leading-none font-semibold tabular-nums',
                getSuccessRateTextClass(summary.success_rate)
              )}
            >
              {formatUptimePct(summary.success_rate)}
            </span>
            <span className='text-muted-foreground text-xs'>
              {t('Success rate')}
            </span>
          </div>
          {active && (
            <div
              aria-hidden
              className='col-start-1 row-start-1 flex flex-col items-end gap-1'
            >
              <span
                className={cn(
                  'font-ascii text-lg leading-none font-semibold tabular-nums',
                  getSuccessRateTextClass(active.success_rate)
                )}
              >
                {formatUptimePct(active.success_rate)}
              </span>
              <span className='font-ascii text-muted-foreground text-xs'>
                {activeTime}
              </span>
            </div>
          )}
        </div>
      </header>

      <GroupSparkline
        series={samples}
        label={t('Availability of group {{group}}', { group: summary.group })}
        activeTs={active?.ts ?? null}
        onActiveChange={setActive}
      />

      <dl className='grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5'>
        <Metric
          label={t('Average latency')}
          value={formatLatency(summary.avg_latency_ms)}
        />
        <Metric
          label={t('Average TTFT')}
          value={formatLatency(summary.avg_ttft_ms)}
        />
        <Metric
          label={t('Throughput')}
          value={formatThroughput(summary.avg_tps)}
        />
        <Metric
          label={t('Requests')}
          value={formatNumber(summary.request_count)}
          hint={String(summary.request_count)}
        />
        <Metric
          label={t('Models')}
          value={
            props.modelCount == null ? '—' : formatNumber(props.modelCount)
          }
        />
      </dl>
    </section>
  )
}
