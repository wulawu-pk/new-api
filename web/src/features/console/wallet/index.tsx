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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useMemo } from 'react'
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
import { readPendingRedeemCode } from '@/features/redeem/lib/pending-code'
import { getUserLogs } from '@/features/usage-logs/api'
import { LOG_TYPE_ENUM } from '@/features/usage-logs/constants'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import { getUserBillingHistory } from '@/features/wallet/api'
import { useTopupInfo } from '@/features/wallet/hooks/use-topup-info'
import { formatQuota } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { SELF_USER_QUERY_KEY, useSelfUser } from '../hooks/use-self-user'
import { ConsolePageHeader } from '../shell/console-shell'
import { OnlineTopupPane } from './components/online-topup-pane'
import { RedeemPane } from './components/redeem-pane'
import { mergeHistory, methodLabel, type WalletHistoryRow } from './lib/history'

const COLS = 5
const HISTORY_SIZE = 20

function HistoryStatus(props: { status: WalletHistoryRow['status'] }) {
  const { t } = useTranslation()
  if (props.status === 'success') {
    return <span className='text-t-ok text-[12.5px]'>● {t('Credited')}</span>
  }
  if (props.status === 'pending') {
    return (
      <span className='text-t-warn text-[12.5px]'>
        ○ {t('Awaiting payment')}
      </span>
    )
  }
  return <span className='text-t-dim text-[12.5px]'>○ {t('Expired')}</span>
}

export function ConsoleWallet() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const self = useSelfUser()
  const topup = useTopupInfo()
  const pendingCode = useMemo(() => readPendingRedeemCode(), [])

  const history = useQuery({
    queryKey: ['console', 'wallet-history'],
    queryFn: async () => {
      const [orders, logs] = await Promise.all([
        getUserBillingHistory(1, HISTORY_SIZE).then(requireServerSuccess),
        getUserLogs({
          p: 1,
          page_size: HISTORY_SIZE,
          type: LOG_TYPE_ENUM.TOPUP,
        }).then(requireServerSuccess),
      ])
      return mergeHistory(
        orders.data?.items ?? [],
        (logs.data?.items ?? []) as UsageLog[]
      ).slice(0, HISTORY_SIZE)
    },
    meta: { errorToast: false },
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: SELF_USER_QUERY_KEY })
    void history.refetch()
  }

  const methodName = (method: string) =>
    methodLabel(
      method,
      topup.topupInfo?.pay_methods.find((m) => m.type === method)?.name
    )

  const rows = history.data ?? []
  const onlineEnabled =
    topup.topupInfo?.enable_online_topup &&
    (topup.topupInfo.pay_methods?.length ?? 0) > 0

  return (
    <>
      <ConsolePageHeader
        title={t('Wallet')}
        description={
          <>
            {t('Balance')}{' '}
            <b className='text-t-fg font-mono'>
              {self.data ? formatQuota(self.data.quota) : <SkeletonText />}
            </b>
            {self.data
              ? `，${t('used {{amount}}', { amount: formatQuota(self.data.used_quota) })}`
              : ''}
            {t('. Both ways of topping up credit $1 for every ¥1.')}
          </>
        }
      />

      <div className='grid grid-cols-2 gap-5 max-md:grid-cols-1 [&>*]:min-w-0'>
        {topup.loading && !topup.topupInfo ? (
          <>
            <Pane title={<b>{t('Redeem a card code')}</b>}>
              <div className='p-6'>
                <SkeletonText width={12} />
              </div>
            </Pane>
            <Pane title={<b>{t('Online top-up')}</b>}>
              <div className='p-6'>
                <SkeletonText width={12} />
              </div>
            </Pane>
          </>
        ) : null}
        {!topup.loading && !topup.topupInfo && (
          <Pane title={<b>{t('Top up')}</b>} className='md:col-span-2'>
            <LoadErrorText
              className='p-5'
              api='/api/user/topup/info'
              onRetry={() => void topup.refetch()}
            />
          </Pane>
        )}
        {topup.topupInfo && (
          <>
            {topup.topupInfo.enable_redemption !== false && (
              <RedeemPane
                amountLinks={topup.topupInfo.amount_links}
                initialCode={pendingCode}
                onRedeemed={refresh}
              />
            )}
            {onlineEnabled ? (
              <OnlineTopupPane topupInfo={topup.topupInfo} onPaid={refresh} />
            ) : (
              <Pane title={<b>{t('Online top-up')}</b>}>
                <p className='text-t-dim m-0 px-5 pt-6 pb-5 text-sm leading-[1.7]'>
                  {t(
                    'Online top-up is not enabled. Redeem a card code instead.'
                  )}
                </p>
              </Pane>
            )}
          </>
        )}
      </div>

      <Pane title={<b>{t('Top-up history')}</b>}>
        <div className='overflow-x-auto px-1 pt-2 pb-1'>
          <ConsoleTable
            minWidth={640}
            stateMode={
              !history.isPending && (history.isError || rows.length === 0)
            }
          >
            <ConsoleTableHeader>
              <ConsoleTableRow className='hover:bg-transparent'>
                <ConsoleTh>{t('Time')}</ConsoleTh>
                <ConsoleTh>{t('Paid with')}</ConsoleTh>
                <ConsoleTh kind='num'>{t('Paid')}</ConsoleTh>
                <ConsoleTh kind='num'>{t('Credited')}</ConsoleTh>
                <ConsoleTh>{t('Status')}</ConsoleTh>
              </ConsoleTableRow>
            </ConsoleTableHeader>
            <ConsoleTableBody>
              {history.isPending && <TableSkeletonRows cols={COLS} rows={3} />}
              {history.isError && (
                <TableMessageRow cols={COLS}>
                  <LoadErrorText
                    api='/api/user/topup/self'
                    reason={errorReason(history.error)}
                    onRetry={() => void history.refetch()}
                  />
                </TableMessageRow>
              )}
              {history.data && rows.length === 0 && (
                <TableMessageRow cols={COLS}>
                  {t(
                    'No top-ups yet. After you top up either way, the records show up here.'
                  )}
                </TableMessageRow>
              )}
              {rows.map((row) => (
                <ConsoleTableRow key={row.id}>
                  <ConsoleTd kind='mono'>
                    {dayjs.unix(row.time).format('MM-DD HH:mm')}
                  </ConsoleTd>
                  <ConsoleTd>
                    {row.kind === 'code'
                      ? t('Card code')
                      : methodName(row.method)}
                  </ConsoleTd>
                  <ConsoleTd kind='num'>
                    {row.kind === 'code' && '—'}
                    {row.kind === 'order' &&
                      row.coin &&
                      `${row.paid} ${row.coin}`}
                    {row.kind === 'order' &&
                      !row.coin &&
                      `¥${(row.paid ?? 0).toFixed(2)}`}
                  </ConsoleTd>
                  <ConsoleTd kind='num'>
                    {row.status !== 'success' && '—'}
                    {row.status === 'success' &&
                      row.creditQuota != null &&
                      formatQuota(row.creditQuota)}
                    {row.status === 'success' &&
                      row.creditQuota == null &&
                      row.creditUSD != null &&
                      `$${row.creditUSD.toFixed(2)}`}
                  </ConsoleTd>
                  <ConsoleTd>
                    <HistoryStatus status={row.status} />
                  </ConsoleTd>
                </ConsoleTableRow>
              ))}
            </ConsoleTableBody>
          </ConsoleTable>
        </div>
      </Pane>
    </>
  )
}
