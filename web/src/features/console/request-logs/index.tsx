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
import { TERM_BUTTON, TERM_INPUT } from '@/components/terminal/styles'
import { TermSelect } from '@/components/terminal/term-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getAllLogs,
  getLogStats,
  getUserLogStats,
  getUserLogs,
} from '@/features/usage-logs/api'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import { useIsAdmin } from '@/hooks/use-admin'
import { useDebounce } from '@/hooks/use-debounce'
import { toIntlLocale } from '@/i18n/languages'
import { formatLogQuota, formatNumber, formatQuota } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { useUserGroups } from '../hooks/use-user-groups'
import { groupName } from '../lib/groups'
import { ConsolePageHeader } from '../shell/console-shell'
import { CacheHitCell, StreamCell } from './components/cells'
import { LogDetail } from './components/log-detail'
import { RefreshControls } from './components/refresh-controls'
import {
  LOG_PAGE_SIZE,
  adminLogQuery,
  buildLogQuery,
  isAllUsers,
  pageCount,
  type LogFilters,
  type LogKind,
  type LogRange,
  type LogScope,
} from './lib/filters'
import { LIVE_INTERVAL_MS, readLivePref, writeLivePref } from './lib/live'
import { compactTokens, toConsoleLogRow } from './lib/log-row'

/** The filter row's dropdowns: as wide as their text, a little shorter. */
const FILTER_SELECT = 'w-auto min-w-[130px] py-2 text-[13.5px]'

export function ConsoleLogs() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const groups = useUserGroups()
  const isAdmin = useIsAdmin()
  // Admins start on every user's logs, as the old log page did.
  const [filters, setFilters] = useState<LogFilters>(() => ({
    range: 'today',
    kind: 'ok',
    group: '',
    model: '',
    page: 1,
    scope: isAdmin ? 'all' : 'self',
    username: '',
  }))
  const [openId, setOpenId] = useState<number | null>(null)
  const [live, setLive] = useState(readLivePref)
  const model = useDebounce(filters.model, 300)
  const username = useDebounce(filters.username, 300)
  const effective = { ...filters, model, username }
  const allUsers = isAllUsers(effective, isAdmin)
  const logApi = allUsers ? '/api/log/' : '/api/log/self'
  const cols = allUsers ? 11 : 10
  const narrowed = Boolean(
    filters.group || filters.model || (allUsers && filters.username)
  )
  // Polling only on page 1: on later pages new rows would shift what the
  // user is reading. React Query skips intervals while the tab is hidden.
  const polling = live && filters.page === 1 ? LIVE_INTERVAL_MS : false

  const logs = useQuery({
    queryKey: ['console', 'logs', allUsers, effective],
    queryFn: async () => {
      const page = { p: effective.page, page_size: LOG_PAGE_SIZE }
      const response = requireServerSuccess(
        allUsers
          ? await getAllLogs({ ...adminLogQuery(effective), ...page })
          : await getUserLogs({ ...buildLogQuery(effective), ...page })
      )
      return {
        items: (response.data?.items ?? []) as UsageLog[],
        total: response.data?.total ?? 0,
      }
    },
    placeholderData: keepPreviousData,
    refetchInterval: polling,
    meta: { errorToast: false },
  })

  const stats = useQuery({
    queryKey: ['console', 'logs-stat', allUsers, { ...effective, page: 0 }],
    queryFn: async () => {
      const response = requireServerSuccess(
        allUsers
          ? await getLogStats(adminLogQuery(effective))
          : await getUserLogStats(buildLogQuery(effective))
      )
      return response.data ?? null
    },
    refetchInterval: polling,
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

  const turnPage = (step: number) => {
    setOpenId(null)
    setFilters((current) => ({ ...current, page: current.page + step }))
  }

  // The list and the totals refresh together. "Updated" is the last time
  // both loaded, so a failed totals request never passes for the list's time.
  const refresh = () => {
    void Promise.all([logs.refetch(), stats.refetch()])
  }
  const updatedAt =
    logs.dataUpdatedAt > 0 && stats.dataUpdatedAt > 0
      ? Math.min(logs.dataUpdatedAt, stats.dataUpdatedAt)
      : 0
  const statsStale = stats.isError

  const changeLive = (next: boolean) => {
    setLive(next)
    writeLivePref(next)
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
              className='text-t-fg border-t-faint border-b hover:border-(--t-accent)'
            >
              {t('Image and video tasks')}
            </Link>
          </>
        }
        actions={
          <RefreshControls
            live={live}
            onLiveChange={changeLive}
            livePaused={filters.page !== 1}
            fetching={logs.isFetching || stats.isFetching}
            updatedAt={updatedAt}
            onRefresh={refresh}
          />
        }
      />

      <div className='flex flex-wrap items-center gap-2.5'>
        {isAdmin && (
          <TermSelect
            aria-label={t('Whose requests')}
            value={filters.scope}
            options={[
              { value: 'all', label: t('All users') },
              { value: 'self', label: t('My requests') },
            ]}
            onValueChange={(value) =>
              update({ scope: value as LogScope, username: '' })
            }
            className={FILTER_SELECT}
          />
        )}
        {isAdmin && filters.scope === 'all' && (
          <Input
            aria-label={t('Username')}
            placeholder={t('Username')}
            value={filters.username}
            onChange={(event) => update({ username: event.target.value })}
            className={cn(
              TERM_INPUT,
              'w-auto min-w-[130px] py-2 font-mono text-[13.5px] max-[480px]:flex-1'
            )}
          />
        )}
        <TermSelect
          aria-label={t('Time range')}
          value={filters.range}
          options={[
            { value: 'today', label: t('Today') },
            { value: '7d', label: t('Last 7 days') },
            { value: 'month', label: t('Month to date') },
          ]}
          onValueChange={(value) => update({ range: value as LogRange })}
          className={FILTER_SELECT}
        />
        <TermSelect
          aria-label={t('Result')}
          value={filters.kind}
          options={[
            { value: 'ok', label: t('Successful requests') },
            { value: 'failed', label: t('Failed requests') },
          ]}
          onValueChange={(value) => update({ kind: value as LogKind })}
          className={FILTER_SELECT}
        />
        <TermSelect
          aria-label={t('Group')}
          value={filters.group}
          options={[
            { value: '', label: t('All groups') },
            ...(groups.data ?? []).map((group) => ({
              value: group.key,
              label: groupName(group.key, t, group.desc),
            })),
          ]}
          onValueChange={(value) => update({ group: value })}
          className={cn(FILTER_SELECT, 'min-w-[150px]')}
        />
        <Input
          aria-label={t('Search model')}
          placeholder={t('Search model')}
          value={filters.model}
          onChange={(event) => update({ model: event.target.value })}
          className={cn(
            TERM_INPUT,
            'w-auto min-w-[150px] py-2 font-mono text-[13.5px] max-[480px]:flex-1'
          )}
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
                !statsStale && <SkeletonText />
              )}
              {statsStale && (
                <span
                  className='text-t-warn ml-1.5 text-[12.5px]'
                  title={errorReason(stats.error)}
                >
                  {t('Totals not updated')}
                </span>
              )}
            </>
          )}
        </span>
      </div>

      <Pane hero title={<b>{t('Requests')}</b>}>
        <div className='overflow-x-auto px-1 pt-2 pb-1'>
          <ConsoleTable minWidth={960} stateMode={showState}>
            <ConsoleTableHeader>
              <ConsoleTableRow className='hover:bg-transparent'>
                <ConsoleTh>{t('Time')}</ConsoleTh>
                {allUsers && <ConsoleTh>{t('User')}</ConsoleTh>}
                <ConsoleTh>Key</ConsoleTh>
                <ConsoleTh>{t('Model')}</ConsoleTh>
                <ConsoleTh>{t('Group')}</ConsoleTh>
                <ConsoleTh kind='num'>{t('Input')}</ConsoleTh>
                <ConsoleTh kind='num'>{t('Output')}</ConsoleTh>
                <ConsoleTh>{t('Cache hit')}</ConsoleTh>
                <ConsoleTh>{t('Mode')}</ConsoleTh>
                <ConsoleTh kind='num'>{t('Time taken')}</ConsoleTh>
                <ConsoleTh kind='num'>{t('Charge')}</ConsoleTh>
              </ConsoleTableRow>
            </ConsoleTableHeader>
            <ConsoleTableBody>
              {logs.isPending && <TableSkeletonRows cols={cols} />}
              {logs.isError && (
                <TableMessageRow cols={cols}>
                  <LoadErrorText
                    api={logApi}
                    reason={errorReason(logs.error)}
                    onRetry={() => void logs.refetch()}
                  />
                </TableMessageRow>
              )}
              {logs.data && rows.length === 0 && (
                <TableMessageRow cols={cols}>
                  {narrowed
                    ? t(
                        'No requests match. Try another group or clear the search.'
                      )
                    : t('No requests in this period yet.')}
                  {!narrowed && !allUsers && (
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
                      className='data-[state=selected]:bg-t-bg3 cursor-pointer'
                      onClick={() => toggleRow(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          toggleRow(row.id)
                        }
                      }}
                    >
                      <ConsoleTd kind='mono'>
                        {dayjs
                          .unix(row.createdAt)
                          .format(
                            filters.range === 'today'
                              ? 'HH:mm:ss'
                              : 'MM-DD HH:mm'
                          )}
                      </ConsoleTd>
                      {allUsers && (
                        <ConsoleTd
                          kind='mono'
                          className='max-w-[140px] truncate'
                        >
                          {row.username || '—'}
                        </ConsoleTd>
                      )}
                      <ConsoleTd className='max-w-[160px] truncate'>
                        {row.tokenName || '—'}
                      </ConsoleTd>
                      <ConsoleTd kind='mono'>{row.model || '—'}</ConsoleTd>
                      <ConsoleTd>{groupName(row.group, t) || '—'}</ConsoleTd>
                      <ConsoleTd kind='num'>
                        {compactTokens(row.input)}
                      </ConsoleTd>
                      <ConsoleTd kind='num'>
                        {compactTokens(row.output)}
                      </ConsoleTd>
                      <ConsoleTd>
                        {row.isError ? (
                          <span className='text-t-warn text-[12.5px]'>
                            ! {t('Failed')}
                          </span>
                        ) : (
                          <CacheHitCell rate={row.cacheHit} />
                        )}
                      </ConsoleTd>
                      <ConsoleTd>
                        <StreamCell streamed={row.isStream} />
                      </ConsoleTd>
                      <ConsoleTd kind='num'>{row.useTime}s</ConsoleTd>
                      <ConsoleTd kind='num'>
                        {formatLogQuota(row.quota)}
                      </ConsoleTd>
                    </ConsoleTableRow>
                    {open && (
                      <tr className='bg-t-bg3'>
                        <td
                          colSpan={cols}
                          className='px-3.5 pt-1 pb-[18px] whitespace-normal'
                        >
                          <LogDetail row={row} showChannel={allUsers} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </ConsoleTableBody>
          </ConsoleTable>
        </div>
        {logs.data && total > 0 && (
          // Sticks to the window bottom, just above the 36px status bar.
          <nav
            aria-label={t('Pagination')}
            className='border-t-line bg-t-bg2 text-t-dim sticky bottom-9 z-[5] flex flex-wrap items-center justify-end gap-3 border-t px-3.5 py-2.5 text-[13px]'
          >
            <span className='mr-auto'>
              {t('{{count}} in total, {{size}} per page', {
                count: formatNumber(total, locale),
                size: LOG_PAGE_SIZE,
              })}
            </span>
            <span className='font-mono'>
              {filters.page} / {pages}
            </span>
            <Button
              size='sm'
              variant='outline'
              className={TERM_BUTTON}
              disabled={filters.page <= 1}
              onClick={() => turnPage(-1)}
            >
              {t('Previous page')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              className={TERM_BUTTON}
              disabled={filters.page >= pages}
              onClick={() => turnPage(1)}
            >
              {t('Next page')}
            </Button>
          </nav>
        )}
      </Pane>
    </>
  )
}
