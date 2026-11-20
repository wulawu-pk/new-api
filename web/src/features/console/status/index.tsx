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
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AsciiSpark } from '@/components/terminal/ascii-spark'
import { LoadErrorText } from '@/components/terminal/data-states'
import { errorReason } from '@/components/terminal/lib'
import { Pane } from '@/components/terminal/pane'
import { getGroupSummary } from '@/features/service-status/api'
import type { GroupHealthSummary } from '@/features/service-status/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { HIDDEN_GROUPS, groupName, sortGroups } from '../lib/groups'
import { ConsolePageHeader } from '../shell/console-shell'
import { MIN_REQUESTS_FOR_RATE, toSlots } from './lib/slots'

type Hours = 24 | 168

function GroupCard(props: {
  group: GroupHealthSummary
  windowStart: number
  windowEnd: number
  hours: Hours
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const g = props.group
  const enough = g.request_count >= MIN_REQUESTS_FOR_RATE
  const warn = enough && g.success_rate < 99.5
  const slots = toSlots(g.series, props.windowStart, props.windowEnd)
  const format = props.hours === 24 ? 'MM-DD HH:00' : 'MM-DD HH:mm'
  return (
    <Pane
      title={<b>{groupName(g.group, t)}</b>}
      aria-label={groupName(g.group, t)}
      className='px-5 pt-[22px] pb-[18px]'
    >
      <div className='mb-2 flex items-baseline justify-between gap-3'>
        <span className='text-t-dim font-mono text-xs'>{g.group}</span>
        <span
          className={cn(
            'font-mono text-[22px] font-medium',
            !enough && 'text-t-dim text-sm',
            enough && (warn ? 'text-t-warn' : 'text-t-ok')
          )}
        >
          {enough
            ? `${g.success_rate.toFixed(1)}%`
            : t('Too few requests to rate')}
        </span>
      </div>
      <AsciiSpark
        className='mb-3.5'
        label={t('Availability trend')}
        warnBelow={99}
        cells={slots.map((slot) => ({
          id: slot.start,
          value: slot.rate,
          title:
            slot.rate == null
              ? `${dayjs.unix(slot.start).format(format)} · ${t('no requests')}`
              : `${dayjs.unix(slot.start).format(format)} · ${slot.rate.toFixed(1)}%`,
        }))}
      />
      <dl className='text-t-dim m-0 grid grid-cols-4 gap-2 text-[12.5px] max-[480px]:grid-cols-2'>
        <div>
          <dt>{t('Requests')}</dt>
          <dd className='text-t-fg mt-0.5 ml-0 font-mono text-sm font-medium'>
            {formatNumber(g.request_count, locale)}
          </dd>
        </div>
        <div>
          <dt>{t('Avg latency')}</dt>
          <dd className='text-t-fg mt-0.5 ml-0 font-mono text-sm font-medium'>
            {g.avg_latency_ms > 0
              ? `${(g.avg_latency_ms / 1000).toFixed(2)} s`
              : '—'}
          </dd>
        </div>
        <div>
          <dt>{t('Time to first token')}</dt>
          <dd className='text-t-fg mt-0.5 ml-0 font-mono text-sm font-medium'>
            {g.avg_ttft_ms > 0 ? `${(g.avg_ttft_ms / 1000).toFixed(1)} s` : '—'}
          </dd>
        </div>
        <div>
          <dt>{t('Throughput')}</dt>
          <dd className='text-t-fg mt-0.5 ml-0 font-mono text-sm font-medium'>
            {g.avg_tps > 0 ? `${Math.round(g.avg_tps)} tok/s` : '—'}
          </dd>
        </div>
      </dl>
    </Pane>
  )
}

/** Service status (window 6): availability of every group from real requests. */
export function ConsoleStatus() {
  const { t } = useTranslation()
  const [hours, setHours] = useState<Hours>(24)
  const summary = useQuery({
    queryKey: ['console', 'status', hours],
    queryFn: async () => {
      const data = await getGroupSummary(hours)
      return data
    },
    placeholderData: keepPreviousData,
    meta: { errorToast: false },
  })

  const now = dayjs().unix()
  const windowEnd = summary.data?.window_end ?? now
  const windowStart = summary.data?.window_start ?? windowEnd - hours * 3600
  const byKey = new Map((summary.data?.groups ?? []).map((g) => [g.group, g]))
  const groups = sortGroups(
    [...byKey.keys()].filter((key) => !HIDDEN_GROUPS.has(key))
  )
    .map((key) => byKey.get(key))
    .filter((g): g is GroupHealthSummary => g != null)

  return (
    <>
      <ConsolePageHeader
        title={t('Service status')}
        description={t(
          'Results of real requests, per group. Requests refused for low balance or bad parameters do not count as failures.'
        )}
        actions={
          <div
            role='group'
            aria-label={t('Time range')}
            className='border-t-faint inline-flex border'
          >
            {([24, 168] as const).map((h, index) => (
              <button
                key={h}
                type='button'
                aria-pressed={hours === h}
                onClick={() => setHours(h)}
                className={cn(
                  'px-3 py-1.5 text-[13px]',
                  index > 0 && 'border-t-faint border-l',
                  hours === h
                    ? 'bg-t-fg text-t-bg'
                    : 'text-t-dim hover:text-t-fg'
                )}
              >
                {h === 24 ? t('24 hours') : t('7 days')}
              </button>
            ))}
          </div>
        }
      />
      {summary.isPending && (
        <div className='grid grid-cols-2 gap-x-5 gap-y-6 max-md:grid-cols-1'>
          {[0, 1].map((i) => (
            <Pane key={i} title={<b>░░░░</b>} className='px-5 py-8'>
              <span className='t-skeleton font-mono'>░░░░░░░░░░░░░░░░░░░░</span>
            </Pane>
          ))}
        </div>
      )}
      {summary.isError && (
        <Pane title={<b>{t('Status')}</b>}>
          <LoadErrorText
            className='p-5'
            api={`/api/perf-metrics/groups?hours=${hours}`}
            reason={errorReason(summary.error)}
            onRetry={() => void summary.refetch()}
          />
        </Pane>
      )}
      {summary.data && groups.length === 0 && (
        <p className='text-t-dim text-sm'>
          {t('No requests in this period yet.')}
        </p>
      )}
      {groups.length > 0 && (
        <div className='grid grid-cols-2 gap-x-5 gap-y-6 max-md:grid-cols-1'>
          {groups.map((group) => (
            <GroupCard
              key={group.group}
              group={group}
              windowStart={windowStart}
              windowEnd={windowEnd}
              hours={hours}
            />
          ))}
        </div>
      )}
    </>
  )
}
