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
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AsciiBar } from '@/components/terminal/ascii-bar'
import {
  ConsoleTable,
  ConsoleTableBody,
  ConsoleTableHeader,
  ConsoleTableRow,
  ConsoleTd,
  ConsoleTh,
} from '@/components/terminal/console-table'
import {
  LoadErrorText,
  SkeletonText,
  TableMessageRow,
  TableSkeletonRows,
} from '@/components/terminal/data-states'
import { errorReason } from '@/components/terminal/lib'
import { Pane } from '@/components/terminal/pane'
import { RollingNumber } from '@/components/terminal/rolling-number'
import { Button } from '@/components/ui/button'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'
import { formatLogQuota, formatNumber, formatQuota } from '@/lib/format'

import { useSelfUser } from '../hooks/use-self-user'
import { groupName } from '../lib/groups'
import { CacheHitCell, UsageText } from '../request-logs/components/cells'
import { toConsoleLogRow } from '../request-logs/lib/log-row'
import { ConsolePageHeader } from '../shell/console-shell'
import { StartGuide } from './components/start-guide'
import { WeekChart } from './components/week-chart'
import {
  useFirstKey,
  useMonthRequestTotals,
  useMonthUsage,
  useRecentRequests,
} from './hooks/use-overview'
import {
  availability,
  averageCacheHitRate,
  bucketByDay,
  formatPercentFloor,
  sumUsage,
} from './lib/overview-data'
import {
  apiBase,
  readGuideHidden,
  sampleModel,
  writeGuideHidden,
} from './lib/start-guide'

const RECENT_ROWS = 5
const CACHE_SAMPLE = 100

function Kpi(props: {
  label: string
  value: React.ReactNode
  big?: boolean
  tone?: 'ok' | 'warn'
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`border-t-line min-w-0 border-l px-5 pt-5 pb-[18px] first:border-l-0 ${
        props.className ?? ''
      }`}
    >
      <small className='text-t-dim mb-1.5 block text-[12.5px]'>
        {props.label}
      </small>
      <b
        className={`font-mono font-medium [font-variant-numeric:tabular-nums] ${
          props.big ? 'text-[36px] tracking-[-0.02em]' : 'text-[22px]'
        }${
          props.tone === 'ok' ? ' text-t-ok' : ''
        }${props.tone === 'warn' ? ' text-t-warn' : ''}`}
      >
        {props.value}
      </b>
      {props.children}
    </div>
  )
}

export function ConsoleOverview() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const self = useSelfUser()
  const usage = useMonthUsage()
  const totals = useMonthRequestTotals()
  const recent = useRecentRequests(CACHE_SAMPLE)
  const firstKey = useFirstKey()
  const pricing = usePricingData()
  const keyGroup = firstKey.data?.group || undefined
  const groupModels = useMemo(
    () =>
      keyGroup
        ? pricing.models
            .filter((model) => model.enable_groups?.includes(keyGroup))
            .map((model) => model.model_name)
        : [],
    [pricing.models, keyGroup]
  )
  const { status } = useStatus()
  const [guideHidden, setGuideHidden] = useState(readGuideHidden)
  const showGuide = (hidden: boolean) => {
    writeGuideHidden(hidden)
    setGuideHidden(hidden)
  }

  const now = useMemo(() => dayjs(), [])
  const monthUsage = useMemo(() => {
    const start = now.startOf('month').unix()
    return sumUsage((usage.data ?? []).filter((row) => row.created_at >= start))
  }, [usage.data, now])
  const week = useMemo(
    () => bucketByDay(usage.data ?? [], now),
    [usage.data, now]
  )
  const cacheRate = useMemo(
    () => averageCacheHitRate(recent.data ?? []),
    [recent.data]
  )
  const rows = useMemo(
    () => (recent.data ?? []).slice(0, RECENT_ROWS).map(toConsoleLogRow),
    [recent.data]
  )

  const balance = self.data?.quota ?? 0
  const avail = totals.data
    ? availability(totals.data.ok, totals.data.failed)
    : null

  const refetchAll = () => {
    void self.refetch()
    void usage.refetch()
    void totals.refetch()
    void recent.refetch()
  }

  let balanceValue: React.ReactNode = <SkeletonText />
  if (self.isError) balanceValue = '—'
  else if (self.data) {
    balanceValue = <RollingNumber text={formatQuota(balance)} />
  }

  let requestsValue: React.ReactNode = <SkeletonText />
  if (usage.isError) requestsValue = '—'
  else if (usage.data) {
    requestsValue = (
      <RollingNumber text={formatNumber(monthUsage.count, locale)} />
    )
  }

  let availValue: React.ReactNode = <SkeletonText />
  if (totals.isError) availValue = '—'
  else if (totals.data) {
    availValue =
      avail == null ? '—' : <RollingNumber text={formatPercentFloor(avail)} />
  }

  let cacheValue: React.ReactNode = <SkeletonText />
  if (recent.isError) cacheValue = '—'
  else if (recent.data) {
    cacheValue =
      cacheRate == null ? (
        '—'
      ) : (
        <RollingNumber text={formatPercentFloor(cacheRate)} />
      )
  }

  const kpiError = self.isError || usage.isError || totals.isError
  let kpiErrorApi = '/api/log/self'
  if (self.isError) kpiErrorApi = '/api/user/self'
  else if (usage.isError) kpiErrorApi = '/api/data/self'
  let availTone: 'ok' | 'warn' | undefined
  if (avail != null) availTone = avail < 0.99 ? 'warn' : 'ok'

  return (
    <>
      <ConsolePageHeader
        title={t('Overview')}
        description={t('Usage this month so far.')}
        actions={
          guideHidden ? (
            <Button
              size='sm'
              variant='outline'
              className='rounded-full'
              onClick={() => showGuide(false)}
            >
              {t('Setup guide')}
            </Button>
          ) : undefined
        }
      />

      {!guideHidden && self.data && !firstKey.isPending && (
        <StartGuide
          keyDone={firstKey.data != null}
          topUpDone={balance > 0}
          requestDone={self.data.request_count > 0}
          apiKey={firstKey.data ?? null}
          base={apiBase(status?.server_address)}
          model={sampleModel(recent.data ?? [], keyGroup, groupModels)}
          balance={formatQuota(balance)}
          onHide={() => showGuide(true)}
        />
      )}

      <Pane title={<b>{t('Month to date')}</b>}>
        <div className='grid grid-cols-[1.4fr_1fr_1fr_1fr] max-md:grid-cols-2'>
          <Kpi
            label={t('Balance')}
            value={balanceValue}
            big
            className='max-md:col-span-2'
          >
            <div className='text-t-dim mt-2.5 overflow-hidden font-mono text-xs whitespace-nowrap'>
              {usage.data && self.data && monthUsage.quota > 0 && (
                <>
                  <AsciiBar
                    value={monthUsage.quota}
                    max={monthUsage.quota + balance}
                    tone='pink'
                  />
                  {'　'}
                  {t('Used this month {{amount}}', {
                    amount: formatQuota(monthUsage.quota),
                  })}
                </>
              )}
              {usage.data && monthUsage.quota === 0 && (
                <>
                  <AsciiBar value={0} />
                  {'　'}
                  {t('No usage this month yet')}
                </>
              )}
            </div>
          </Kpi>
          <Kpi
            label={t('Requests')}
            value={requestsValue}
            className='max-md:border-t-line max-md:border-t max-md:border-l-0'
          />
          <Kpi
            label={t('Success rate')}
            value={availValue}
            tone={availTone}
            className='max-md:border-t-line max-md:border-t'
          />
          <Kpi
            label={t('Avg cache hit')}
            value={cacheValue}
            className='max-md:border-t-line max-md:border-t max-md:border-l-0'
          />
        </div>
        {kpiError && (
          <LoadErrorText
            className='border-t-line border-t px-5 py-3'
            api={kpiErrorApi}
            reason={errorReason(self.error ?? usage.error ?? totals.error)}
            onRetry={refetchAll}
          />
        )}
      </Pane>

      <div className='grid grid-cols-[1.3fr_1fr] gap-5 max-md:grid-cols-1 [&>*]:min-w-0'>
        <Pane title={<b>{t('Spend, last 7 days')}</b>}>
          {usage.isPending && (
            <div className='flex h-[218px] items-center justify-center'>
              <span className='t-skeleton font-mono'>░░░░░░░░</span>
            </div>
          )}
          {usage.isError && (
            <div className='flex min-h-[218px] items-center justify-center p-[18px]'>
              <LoadErrorText
                api='/api/data/self'
                reason={errorReason(usage.error)}
                onRetry={() => void usage.refetch()}
              />
            </div>
          )}
          {usage.data &&
            (week.some((day) => day.quota > 0) ? (
              <WeekChart days={week} />
            ) : (
              <div className='text-t-dim flex min-h-[218px] items-center justify-center p-[18px] text-center text-sm'>
                {t('No spending in the last 7 days.')}
              </div>
            ))}
        </Pane>

        <Pane title={<b>{t('Tips')}</b>}>
          <div className='text-t-fg2 flex flex-col gap-3 px-[18px] pt-[22px] pb-[18px] text-sm leading-[1.7]'>
            {[
              t('Claude Code: set the Base URL to {{url}}, without /v1.', {
                url: 'https://api.peroai.cc',
              }),
              t(
                'A key belongs to one group; create separate keys for GPT and Claude.'
              ),
              t(
                'Charges are recorded per request in Logs; billing follows the logs.'
              ),
            ].map((tip) => (
              <div key={tip} className='grid grid-cols-[18px_1fr] gap-2'>
                <span className='text-t-pink font-mono' aria-hidden='true'>
                  ▸
                </span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </Pane>
      </div>

      <Pane
        title={
          <>
            <b>{t('Recent requests')}</b>
            {'　'}
            <Link to='/usage-logs' className='text-t-dim hover:text-t-fg'>
              {t('All logs')}
            </Link>
          </>
        }
      >
        <div className='overflow-x-auto px-1 pt-2 pb-1'>
          <ConsoleTable
            minWidth={640}
            stateMode={
              !recent.isPending && (recent.isError || rows.length === 0)
            }
          >
            <ConsoleTableHeader>
              <ConsoleTableRow className='hover:bg-transparent'>
                <ConsoleTh>{t('Time')}</ConsoleTh>
                <ConsoleTh>{t('Model')}</ConsoleTh>
                <ConsoleTh>{t('Group')}</ConsoleTh>
                <ConsoleTh>{t('Usage')}</ConsoleTh>
                <ConsoleTh>{t('Cache hit')}</ConsoleTh>
                <ConsoleTh kind='num'>{t('Charge')}</ConsoleTh>
              </ConsoleTableRow>
            </ConsoleTableHeader>
            <ConsoleTableBody>
              {recent.isPending && <TableSkeletonRows cols={6} />}
              {recent.isError && (
                <TableMessageRow cols={6}>
                  <LoadErrorText
                    api='/api/log/self'
                    reason={errorReason(recent.error)}
                    onRetry={() => void recent.refetch()}
                  />
                </TableMessageRow>
              )}
              {recent.data && rows.length === 0 && (
                <TableMessageRow cols={6}>
                  {t(
                    'No requests yet. Send your first request with the configuration from the home page; it shows up here within seconds.'
                  )}
                  <div className='mt-3'>
                    <Button size='sm' variant='outline' render={<a href='/' />}>
                      {t('See configuration')}
                    </Button>
                  </div>
                </TableMessageRow>
              )}
              {rows.map((row) => (
                <ConsoleTableRow key={row.id}>
                  <ConsoleTd kind='mono'>
                    {dayjs.unix(row.createdAt).format('HH:mm')}
                  </ConsoleTd>
                  <ConsoleTd kind='mono'>{row.model}</ConsoleTd>
                  <ConsoleTd>{groupName(row.group, t)}</ConsoleTd>
                  <ConsoleTd kind='mono'>
                    <UsageText row={row} />
                  </ConsoleTd>
                  <ConsoleTd>
                    <CacheHitCell rate={row.cacheHit} />
                  </ConsoleTd>
                  <ConsoleTd kind='num'>{formatLogQuota(row.quota)}</ConsoleTd>
                </ConsoleTableRow>
              ))}
            </ConsoleTableBody>
          </ConsoleTable>
        </div>
      </Pane>
    </>
  )
}
