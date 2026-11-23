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
import { TermSegmented } from '@/components/terminal/term-segmented'
import { getGroupSummary } from '@/features/service-status/api'
import type { GroupHealthSummary } from '@/features/service-status/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { HIDDEN_GROUPS, groupName, sortGroups } from '../lib/groups'
import { successRateClass } from '../lib/success-rate'
import { ConsolePageHeader } from '../shell/console-shell'
import { MIN_REQUESTS_FOR_RATE, toSlots } from './lib/slots'

type Hours = 24 | 168

/** Columns shared by every row and the time axis: name, bars, rate. */
const ROW_GRID =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 px-6 md:grid-cols-[12rem_minmax(0,1fr)_7.5rem]'

const STAT_DD = 'text-t-fg ml-0 font-mono text-[13px] font-medium'

/**
 * One group as one row of the status list: name, availability bars and the
 * rate on one line, the request figures under the bars. Rows share their
 * column widths, so bars and rates line up from group to group.
 */
function GroupRow(props: {
  group: GroupHealthSummary
  windowStart: number
  windowEnd: number
  hours: Hours
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const g = props.group
  const name = groupName(g.group, t)
  const enough = g.request_count >= MIN_REQUESTS_FOR_RATE
  const slots = toSlots(g.series, props.windowStart, props.windowEnd)
  const format = props.hours === 24 ? 'MM-DD HH:00' : 'MM-DD HH:mm'
  return (
    <article
      aria-label={name}
      className={cn(ROW_GRID, 'border-t-line py-5 [&+&]:border-t')}
    >
      <div className='min-w-0 md:col-start-1 md:row-start-1'>
        <div className='text-t-fg truncate text-sm font-medium'>{name}</div>
        <div className='text-t-dim mt-1 truncate font-mono text-[11.5px]'>
          {g.group}
        </div>
      </div>
      <div className='text-right md:col-start-3 md:row-start-1'>
        {enough ? (
          <span
            className={cn(
              'font-mono text-xl leading-none font-medium',
              successRateClass(g.success_rate)
            )}
          >
            {`${g.success_rate.toFixed(1)}%`}
          </span>
        ) : (
          <span className='text-t-dim text-xs leading-snug'>
            {t('Too few requests to rate')}
          </span>
        )}
      </div>
      <AsciiSpark
        className='col-span-2 h-9 md:col-span-1 md:col-start-2 md:row-start-1'
        cellClassName='rounded-[2px]'
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
      <dl className='text-t-dim col-span-2 m-0 flex flex-wrap gap-x-6 gap-y-1.5 text-xs md:col-start-2 md:row-start-2'>
        <div className='flex items-baseline gap-2'>
          <dt>{t('Requests')}</dt>
          <dd className={STAT_DD}>{formatNumber(g.request_count, locale)}</dd>
        </div>
        <div className='flex items-baseline gap-2'>
          <dt>{t('Avg latency')}</dt>
          <dd className={STAT_DD}>
            {g.avg_latency_ms > 0
              ? `${(g.avg_latency_ms / 1000).toFixed(2)} s`
              : '—'}
          </dd>
        </div>
        <div className='flex items-baseline gap-2'>
          <dt>{t('Time to first token')}</dt>
          <dd className={STAT_DD}>
            {g.avg_ttft_ms > 0 ? `${(g.avg_ttft_ms / 1000).toFixed(1)} s` : '—'}
          </dd>
        </div>
        <div className='flex items-baseline gap-2'>
          <dt>{t('Throughput')}</dt>
          <dd className={STAT_DD}>
            {g.avg_tps > 0 ? `${Math.round(g.avg_tps)} tok/s` : '—'}
          </dd>
        </div>
      </dl>
    </article>
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
          <TermSegmented
            label={t('Time range')}
            value={String(hours)}
            onValueChange={(value) => setHours(Number(value) as Hours)}
            items={[
              { value: '24', label: t('24 hours') },
              { value: '168', label: t('7 days') },
            ]}
          />
        }
      />
      {summary.isPending && (
        <Pane title={<b>{t('Availability per group')}</b>}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(ROW_GRID, 'border-t-line py-6 [&+&]:border-t')}
            >
              <span className='t-skeleton font-mono'>░░░░░░░░</span>
              <span className='t-skeleton col-span-2 font-mono md:col-span-1 md:col-start-2 md:row-start-1'>
                ░░░░░░░░░░░░░░░░░░░░░░░░
              </span>
            </div>
          ))}
        </Pane>
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
        <Pane title={<b>{t('Availability per group')}</b>}>
          {groups.map((group) => (
            <GroupRow
              key={group.group}
              group={group}
              windowStart={windowStart}
              windowEnd={windowEnd}
              hours={hours}
            />
          ))}
          <div
            aria-hidden='true'
            className={cn(
              ROW_GRID,
              'border-t-line text-t-dim border-t py-3 font-mono text-[11px]'
            )}
          >
            <div className='col-span-2 flex justify-between md:col-span-1 md:col-start-2'>
              <span>{hours === 24 ? t('24 hours ago') : t('7 days ago')}</span>
              <span>{t('Now')}</span>
            </div>
          </div>
        </Pane>
      )}
    </>
  )
}
