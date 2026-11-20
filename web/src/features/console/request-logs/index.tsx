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
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
import {
  TERM_BUTTON,
  TERM_INPUT,
  TERM_SELECT,
} from '@/components/terminal/styles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select'
import { getUserLogStats, getUserLogs } from '@/features/usage-logs/api'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import { useDebounce } from '@/hooks/use-debounce'
import { toIntlLocale } from '@/i18n/languages'
import { formatLogQuota, formatNumber, formatQuota } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { useUserGroups } from '../hooks/use-user-groups'
import { groupName } from '../lib/groups'
import { ConsolePageHeader } from '../shell/console-shell'
import { CacheHitCell } from './components/cells'
import { LogDetail } from './components/log-detail'
import {
  LOG_PAGE_SIZE,
  buildLogQuery,
  pageCount,
  type LogFilters,
  type LogKind,
  type LogRange,
} from './lib/filters'
import { compactTokens, toConsoleLogRow } from './lib/log-row'

const COLS = 9

export function ConsoleLogs() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const groups = useUserGroups()
  const [filters, setFilters] = useState<LogFilters>({
    range: 'today',
    kind: 'ok',
    group: '',
    model: '',
    page: 1,
  })
  const [openId, setOpenId] = useState<number | null>(null)
  const model = useDebounce(filters.model, 300)
  const effective = { ...filters, model }

  const logs = useQuery({
    queryKey: ['console', 'logs', effective],
    queryFn: async () => {
      const response = requireServerSuccess(
        await getUserLogs({
          ...buildLogQuery(effective),
          p: effective.page,
          page_size: LOG_PAGE_SIZE,
        })
      )
      return {
        items: (response.data?.items ?? []) as UsageLog[],
        total: response.data?.total ?? 0,
      }
    },
    placeholderData: keepPreviousData,
    meta: { errorToast: false },
  })

  const stats = useQuery({
    queryKey: ['console', 'logs-stat', { ...effective, page: 0 }],
    queryFn: async () => {
      const response = requireServerSuccess(
        await getUserLogStats(buildLogQuery(effective))
      )
      return response.data ?? null
    },
    meta: { errorToast: false },
  })

  const rows = useMemo(
    () => (logs.data?.items ?? []).map(toConsoleLogRow),
    [logs.data]
  )
  const total = logs.data?.total ?? 0
  const pages = pageCount(total)

  const update = (patch: Partial<LogFilters>) => {
    setOpenId(null)
    setFilters((current) => ({ ...current, page: 1, ...patch }))
  }

  const rangeLabel: Record<LogRange, string> = {
    today: t('Today'),
    '7d': t('Last 7 days'),
    month: t('Month to date'),
  }

  const toggleRow = (id: number) =>
    setOpenId((current) => (current === id ? null : id))

  const showState = !logs.isPending && (logs.isError || rows.length === 0)

  return (
    <>
      <ConsolePageHeader
        title={t('Usage logs')}
        description={
          <>
            {t('One row per request. Click a row for the billing breakdown.')}{' '}
            <Link
              to='/usage-logs/$section'
              params={{ section: 'task' }}
              className='text-t-fg border-t-faint border-b hover:border-t-pink'
            >
              {t('Image and video tasks')}
            </Link>
          </>
        }
      />

      <div className='flex flex-wrap items-center gap-2.5'>
        <NativeSelect
          aria-label={t('Time range')}
          value={filters.range}
          onChange={(event) => update({ range: event.target.value as LogRange })}
          className={cn(TERM_SELECT, 'min-w-[130px] py-2 text-[13.5px]')}
        >
          <NativeSelectOption value='today'>{t('Today')}</NativeSelectOption>
          <NativeSelectOption value='7d'>{t('Last 7 days')}</NativeSelectOption>
          <NativeSelectOption value='month'>{t('Month to date')}</NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          aria-label={t('Result')}
          value={filters.kind}
          onChange={(event) => update({ kind: event.target.value as LogKind })}
          className={cn(TERM_SELECT, 'min-w-[130px] py-2 text-[13.5px]')}
        >
          <NativeSelectOption value='ok'>{t('Successful requests')}</NativeSelectOption>
          <NativeSelectOption value='failed'>{t('Failed requests')}</NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          aria-label={t('Group')}
          value={filters.group}
          onChange={(event) => update({ group: event.target.value })}
          className={cn(TERM_SELECT, 'min-w-[150px] py-2 text-[13.5px]')}
        >
          <NativeSelectOption value=''>{t('All groups')}</NativeSelectOption>
          {(groups.data ?? []).map((group) => (
            <NativeSelectOption key={group.key} value={group.key}>
              {groupName(group.key, t, group.desc)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Input
          aria-label={t('Search model')}
          placeholder={t('Search model')}
          value={filters.model}
          onChange={(event) => update({ model: event.target.value })}
          className={cn(TERM_INPUT, 'w-auto min-w-[150px] py-2 font-mono text-[13.5px] max-[480px]:flex-1')}
        />
        <span className='text-t-dim ml-auto text-[13px] max-[480px]:ml-0 max-[480px]:w-full'>
          {rangeLabel[filters.range]}{' '}
          {logs.data ? (
            <b className='text-t-fg font-mono text-[13.5px] font-medium'>
              {formatNumber(total, locale)}
            </b>
          ) : (
            <SkeletonText />
          )}{' '}
          {t('requests')}
          {filters.kind === 'ok' && (
            <>
              {t(', spent')}{' '}
              {stats.data ? (
                <b className='text-t-fg font-mono text-[13.5px] font-medium'>
                  {formatQuota(stats.data.quota)}
                </b>
              ) : (
                <SkeletonText />
              )}
            </>
          )}
        </span>
      </div>

      <Pane title={<b>{t('Requests')}</b>}>
        <div className='overflow-x-auto px-1 pt-2 pb-1'>
          <ConsoleTable minWidth={900} stateMode={showState}>
            <ConsoleTableHeader>
              <ConsoleTableRow className='hover:bg-transparent'>
                <ConsoleTh>{t('Time')}</ConsoleTh>
                <ConsoleTh>Key</ConsoleTh>
                <ConsoleTh>{t('Model')}</ConsoleTh>
                <ConsoleTh>{t('Group')}</ConsoleTh>
                <ConsoleTh kind='num'>{t('Input')}</ConsoleTh>
                <ConsoleTh kind='num'>{t('Output')}</ConsoleTh>
                <ConsoleTh>{t('Cache hit')}</ConsoleTh>
                <ConsoleTh kind='num'>{t('Time taken')}</ConsoleTh>
                <ConsoleTh kind='num'>{t('Charge')}</ConsoleTh>
              </ConsoleTableRow>
            </ConsoleTableHeader>
            <ConsoleTableBody>
              {logs.isPending && <TableSkeletonRows cols={COLS} />}
              {logs.isError && (
                <TableMessageRow cols={COLS}>
                  <LoadErrorText
                    api='/api/log/self'
                    reason={errorReason(logs.error)}
                    onRetry={() => void logs.refetch()}
                  />
                </TableMessageRow>
              )}
              {logs.data && rows.length === 0 && (
                <TableMessageRow cols={COLS}>
                  {filters.group || filters.model
                    ? t('No requests match. Try another group or clear the search.')
                    : t('No requests in this period yet.')}
                  {!filters.group && !filters.model && (
                    <div className='mt-3'>
                      <Button
                        size='sm'
                        variant='outline'
                        className={TERM_BUTTON}
                        render={<a href='/' />}
                      >
                        {t('See configuration')}
                      </Button>
                    </div>
                  )}
                </TableMessageRow>
              )}
              {rows.map((row) => {
                const open = openId === row.id
                return (
                  <Fragment key={row.id}>
                    <ConsoleTableRow
                      tabIndex={0}
                      aria-expanded={open}
                      data-state={open ? 'selected' : undefined}
                      className='data-[state=selected]:bg-t-bg2 cursor-pointer'
                      onClick={() => toggleRow(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          toggleRow(row.id)
                        }
                      }}
                    >
                      <ConsoleTd kind='mono'>
                        {dayjs.unix(row.createdAt).format(
                          filters.range === 'today' ? 'HH:mm:ss' : 'MM-DD HH:mm'
                        )}
                      </ConsoleTd>
                      <ConsoleTd className='max-w-[160px] truncate'>{row.tokenName || '—'}</ConsoleTd>
                      <ConsoleTd kind='mono'>{row.model || '—'}</ConsoleTd>
                      <ConsoleTd>{groupName(row.group, t) || '—'}</ConsoleTd>
                      <ConsoleTd kind='num'>{compactTokens(row.input)}</ConsoleTd>
                      <ConsoleTd kind='num'>{compactTokens(row.output)}</ConsoleTd>
                      <ConsoleTd>
                        {row.isError ? (
                          <span className='text-t-warn text-[12.5px]'>! {t('Failed')}</span>
                        ) : (
                          <CacheHitCell rate={row.cacheHit} />
                        )}
                      </ConsoleTd>
                      <ConsoleTd kind='num'>{row.useTime}s</ConsoleTd>
                      <ConsoleTd kind='num'>{formatLogQuota(row.quota)}</ConsoleTd>
                    </ConsoleTableRow>
                    {open && (
                      <tr className='bg-t-bg2'>
                        <td colSpan={COLS} className='px-3.5 pt-1 pb-[18px] whitespace-normal'>
                          <LogDetail row={row} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </ConsoleTableBody>
          </ConsoleTable>
        </div>
        {logs.data && pages > 1 && (
          <nav
            aria-label={t('Pagination')}
            className='border-t-line text-t-dim flex items-center justify-end gap-3 border-t px-3.5 py-2.5 text-[13px]'
          >
            <span className='font-mono'>
              {filters.page} / {pages}
            </span>
            <Button
              size='sm'
              variant='outline'
              className={TERM_BUTTON}
              disabled={filters.page <= 1}
              onClick={() => setFilters((c) => ({ ...c, page: c.page - 1 }))}
            >
              {t('Previous page')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              className={TERM_BUTTON}
              disabled={filters.page >= pages}
              onClick={() => setFilters((c) => ({ ...c, page: c.page + 1 }))}
            >
              {t('Next page')}
            </Button>
          </nav>
        )}
      </Pane>
    </>
  )
}
