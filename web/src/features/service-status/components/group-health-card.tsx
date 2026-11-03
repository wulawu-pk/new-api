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

import {
  formatLatency,
  formatThroughput,
  formatUptimePct,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import { formatNumber } from '@/lib/format'
import { translateServerText } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { toSparklineSeries } from '../lib/health'
import type { GroupHealthSummary } from '../types'
import { GroupSparkline } from './group-sparkline'

function Metric(props: {
  label: string
  value: React.ReactNode
  valueClassName?: string
  hint?: string
}) {
  return (
    <div className='flex min-w-0 flex-col gap-1'>
      <dt className='text-muted-foreground truncate text-[11px] leading-4'>
        {props.label}
      </dt>
      <dd
        className={cn(
          'font-mono text-sm font-semibold tabular-nums',
          props.valueClassName
        )}
        title={props.hint}
      >
        {props.value}
      </dd>
    </div>
  )
}

export function GroupHealthCard(props: {
  summary: GroupHealthSummary
  description?: string
  modelCount?: number
}) {
  const { t } = useTranslation()
  const summary = props.summary
  const samples = toSparklineSeries(summary.series)
  const label = props.description
    ? translateServerText(t, props.description)
    : summary.group

  return (
    <section
      aria-label={t('Health of group {{group}}', { group: summary.group })}
      className='bg-card rounded-xl border p-4'
    >
      <header className='flex min-w-0 flex-wrap items-start justify-between gap-2'>
        <div className='min-w-0'>
          <h2
            className='truncate text-sm leading-snug font-semibold'
            title={label}
          >
            {label}
          </h2>
          {label !== summary.group && (
            <p className='text-muted-foreground mt-0.5 truncate font-mono text-xs'>
              {summary.group}
            </p>
          )}
        </div>
        <div className='flex shrink-0 flex-col items-end gap-1'>
          <span
            className={cn(
              'font-mono text-lg leading-none font-semibold tabular-nums',
              getSuccessRateTextClass(summary.success_rate)
            )}
          >
            {formatUptimePct(summary.success_rate)}
          </span>
          <span className='text-muted-foreground text-xs'>
            {t('Success rate')}
          </span>
        </div>
      </header>

      <dl className='mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4'>
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
      </dl>

      <footer className='mt-3 flex flex-wrap items-center justify-between gap-2'>
        <span className='text-muted-foreground flex items-center gap-1 text-xs'>
          <span>{t('Models')}</span>
          <span className='font-mono tabular-nums'>
            {props.modelCount == null ? '—' : formatNumber(props.modelCount)}
          </span>
        </span>
        <GroupSparkline
          series={samples}
          label={t('Availability of group {{group}}', { group: summary.group })}
        />
      </footer>
    </section>
  )
}
