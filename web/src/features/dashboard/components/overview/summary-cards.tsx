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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Flame, ShieldCheck, TrendingDown } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StaggerContainer, StaggerItem } from '@/components/page-transition'
import { getUserQuotaDates } from '@/features/dashboard/api'
import { useSummaryCardsConfig } from '@/features/dashboard/hooks/use-dashboard-config'
import type { QuotaDataItem } from '@/features/dashboard/types'
import { landingAction } from '@/features/home/constants'
import { useStatus } from '@/hooks/use-status'
import { getCurrencyLabel, isCurrencyDisplayEnabled } from '@/lib/currency'
import { formatNumber, formatQuota } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { computeTimeRange } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { DASHBOARD_EYEBROW, DASHBOARD_FRAME } from '../../constants'
import { StatCard } from '../ui/stat-card'

const SUMMARY_SPARKLINE_BUCKETS = 12

type SummarySparklineKey = 'balance' | 'usage' | 'requests'

function getBucketIndex(
  timestamp: number,
  start: number,
  end: number,
  bucketCount: number
): number {
  if (end <= start) return 0
  const ratio = (timestamp - start) / (end - start)
  return Math.min(bucketCount - 1, Math.max(0, Math.floor(ratio * bucketCount)))
}

function buildSummarySparklines(
  data: QuotaDataItem[],
  currentBalance: number,
  start: number,
  end: number
): Record<SummarySparklineKey, number[]> {
  const usage = Array.from({ length: SUMMARY_SPARKLINE_BUCKETS }, () => 0)
  const requests = Array.from({ length: SUMMARY_SPARKLINE_BUCKETS }, () => 0)

  for (const item of data) {
    const timestamp = Number(item.created_at) || start
    const index = getBucketIndex(
      timestamp,
      start,
      end,
      SUMMARY_SPARKLINE_BUCKETS
    )
    usage[index] += Number(item.quota) || 0
    requests[index] += Number(item.count) || 0
  }

  let balance = currentBalance
  const balanceTrend = Array.from(
    { length: SUMMARY_SPARKLINE_BUCKETS },
    () => 0
  )

  for (let index = SUMMARY_SPARKLINE_BUCKETS - 1; index >= 0; index--) {
    balanceTrend[index] = Math.max(0, balance)
    balance += usage[index]
  }

  return {
    balance: balanceTrend,
    usage,
    requests,
  }
}

function getSummarySparkline(
  key: string,
  sparklineData: Record<SummarySparklineKey, number[]>
): number[] | undefined {
  if (key === 'usage') return sparklineData.usage
  if (key === 'requests') return sparklineData.requests
  return undefined
}

function getRunwayDays(
  remainQuota: number,
  recentUsage: number
): number | null {
  if (remainQuota <= 0 || recentUsage <= 0) return null
  const days = remainQuota / recentUsage
  if (!Number.isFinite(days)) return null
  return days
}

type HealthLevel = 'healthy' | 'caution' | 'critical'

function getHealthLevel(remainQuota: number, recentUsage: number): HealthLevel {
  if (remainQuota <= 0) return 'critical'
  const days = getRunwayDays(remainQuota, recentUsage)
  if (days !== null && days < 3) return 'caution'
  return 'healthy'
}

const HEALTH_CONFIG: Record<
  HealthLevel,
  { dotClass: string; labelKey: string }
> = {
  healthy: {
    dotClass: 'bg-landing-accent',
    labelKey: 'Healthy',
  },
  caution: {
    dotClass: 'bg-warning',
    labelKey: 'Low balance',
  },
  critical: {
    dotClass: 'bg-destructive',
    labelKey: 'Balance depleted',
  },
}

export function SummaryCards() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const { status, loading } = useStatus()

  const summaryTimeRange = useMemo(() => computeTimeRange(1), [])
  const remainQuota = Number(user?.quota ?? 0)
  const usedQuota = Number(user?.used_quota ?? 0)
  const requestCount = Number(user?.request_count ?? 0)

  const usageTrendQuery = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      'summary-sparklines',
      summaryTimeRange.start_timestamp,
      summaryTimeRange.end_timestamp,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getUserQuotaDates({
          start_timestamp: summaryTimeRange.start_timestamp,
          end_timestamp: summaryTimeRange.end_timestamp,
          default_time: 'hour',
        })
      ),
    staleTime: 60 * 1000,
  })

  const summaryValues = useMemo(() => {
    return {
      usedDisplay: formatQuota(usedQuota),
      requestCountDisplay: formatNumber(requestCount),
    }
  }, [requestCount, usedQuota])

  const currencyEnabledFromStore = isCurrencyDisplayEnabled()
  const statusCurrencyFlag =
    typeof status?.display_in_currency === 'boolean'
      ? Boolean(status.display_in_currency)
      : undefined
  const currencyEnabled =
    statusCurrencyFlag !== undefined
      ? statusCurrencyFlag
      : currencyEnabledFromStore
  const currencyLabel = currencyEnabled ? getCurrencyLabel() : 'Tokens'

  const sparklineData = useMemo(
    () =>
      buildSummarySparklines(
        usageTrendQuery.data?.data ?? [],
        remainQuota,
        summaryTimeRange.start_timestamp,
        summaryTimeRange.end_timestamp
      ),
    [
      remainQuota,
      summaryTimeRange.end_timestamp,
      summaryTimeRange.start_timestamp,
      usageTrendQuery.data?.data,
    ]
  )

  const recentUsage = useMemo(
    () =>
      (usageTrendQuery.data?.data ?? []).reduce(
        (total, item) => total + (Number(item.quota) || 0),
        0
      ),
    [usageTrendQuery.data?.data]
  )

  const healthLevel = getHealthLevel(remainQuota, recentUsage)
  const healthCfg = HEALTH_CONFIG[healthLevel]
  const runwayDays = getRunwayDays(remainQuota, recentUsage)

  const todayUsageDisplay = formatQuota(recentUsage)
  let runwayDisplay: string
  if (runwayDays !== null) {
    if (runwayDays < 1) {
      runwayDisplay = t('Less than 1 day left')
    } else if (runwayDays > 999) {
      runwayDisplay = `999+ ${t('days')}`
    } else {
      runwayDisplay = `~${formatNumber(Math.floor(runwayDays))} ${t('days')}`
    }
  } else if (remainQuota <= 0) {
    runwayDisplay = t('Balance depleted')
  } else {
    runwayDisplay = t('No recent usage')
  }

  const items = useSummaryCardsConfig({
    ...summaryValues,
    todayUsageDisplay,
    currencyEnabled,
    currencyLabel,
  }).map((config) => ({
    key: config.key,
    title: config.title,
    value: config.value,
    desc: config.description,
    icon: config.icon,
    sparkline:
      config.key === 'todayUsage'
        ? sparklineData.usage
        : getSummarySparkline(config.key, sparklineData),
  }))

  return (
    <section className={DASHBOARD_FRAME}>
      <div className='grid xl:grid-cols-[minmax(0,1fr)_20rem]'>
        <div className='flex min-w-0 flex-col'>
          <div className='relative flex flex-col gap-1 px-4 pt-4 pb-3.5 sm:px-5'>
            <p aria-hidden className={DASHBOARD_EYEBROW}>
              [ {t('Last 24 hours')} ]
            </p>
            <h3 className='text-base font-semibold tracking-tight sm:text-lg'>
              {t('Usage at a glance')}
            </h3>
            <p className='text-muted-foreground text-xs sm:text-sm'>
              {t('Monitor balance, usage, and request volume')}
            </p>
            <div
              aria-hidden
              className='ascii-rule absolute inset-x-0 bottom-0'
            />
          </div>
          <StaggerContainer className='divide-border grid flex-1 grid-cols-3 divide-x'>
            {items.map((it) => (
              <StaggerItem
                key={it.key}
                className='min-w-0 px-3 py-3 sm:px-5 sm:py-5'
              >
                <StatCard
                  title={it.title}
                  value={it.value}
                  description={it.desc}
                  icon={it.icon}
                  tone='signal'
                  sparkline={it.sparkline}
                  sparklineVariant='line'
                  loading={loading}
                  compactMobile
                />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>

        <div className='bg-muted/30 relative flex flex-col justify-between gap-4 overflow-hidden border-t p-4 sm:p-5 xl:border-t-0 xl:border-l'>
          <div
            aria-hidden
            className='ascii-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_90%_80%_at_100%_0%,black,transparent)] opacity-40'
          />
          <div className='relative flex flex-col gap-3'>
            <div className='flex items-center justify-between gap-2'>
              <span className={DASHBOARD_EYEBROW}>{t('Credit remaining')}</span>
              <span className='border-border bg-background/70 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 backdrop-blur'>
                <span aria-hidden className='relative flex size-1.5'>
                  <span
                    className={cn(
                      'absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping',
                      healthCfg.dotClass
                    )}
                  />
                  <span
                    className={cn(
                      'relative size-1.5 rounded-full',
                      healthCfg.dotClass
                    )}
                  />
                </span>
                <span className='text-muted-foreground text-[11px] font-medium'>
                  {t(healthCfg.labelKey)}
                </span>
              </span>
            </div>

            <div className='font-ascii text-3xl leading-none font-semibold tracking-tight break-all tabular-nums'>
              {formatQuota(remainQuota)}
            </div>

            <dl className='divide-border border-border grid grid-cols-2 divide-x border-t pt-3'>
              <div className='flex min-w-0 flex-col gap-1 pr-3'>
                <dt className='text-muted-foreground flex items-center gap-1 text-[11px] leading-none'>
                  <Flame className='size-3 shrink-0' aria-hidden='true' />
                  <span className='truncate'>{t('Last 24h usage')}</span>
                </dt>
                <dd className='font-ascii truncate text-sm font-medium tabular-nums'>
                  {formatQuota(recentUsage)}
                </dd>
              </div>
              <div className='flex min-w-0 flex-col gap-1 pl-3'>
                <dt className='text-muted-foreground flex items-center gap-1 text-[11px] leading-none'>
                  {runwayDays !== null && runwayDays < 3 ? (
                    <TrendingDown
                      className='size-3 shrink-0'
                      aria-hidden='true'
                    />
                  ) : (
                    <ShieldCheck
                      className='size-3 shrink-0'
                      aria-hidden='true'
                    />
                  )}
                  <span className='truncate'>{t('Runway')}</span>
                </dt>
                <dd
                  className={cn(
                    'font-ascii truncate text-sm font-medium tabular-nums',
                    healthLevel === 'critical' && 'text-destructive',
                    healthLevel === 'caution' && 'text-warning'
                  )}
                >
                  {runwayDisplay}
                </dd>
              </div>
            </dl>
          </div>

          <Link
            to='/wallet'
            className={cn(
              landingAction.primary,
              'relative h-11 justify-between sm:w-full'
            )}
          >
            <span>{t('Wallet')}</span>
            <ArrowRight
              className='size-4 transition-transform duration-200 group-hover:translate-x-0.5'
              aria-hidden='true'
            />
          </Link>
        </div>
      </div>
    </section>
  )
}
