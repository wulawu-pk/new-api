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

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatUptimePct,
  getSuccessRateDotClass,
  getSuccessRateLevel,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import { usePricingData } from '@/features/pricing/hooks'
import { readGroupDescription } from '@/features/pricing/types'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { GroupHealthCard } from './components/group-health-card'
import { useGroupHealth } from './hooks/use-group-health'
import {
  countModelsByGroup,
  overallAvailability,
  totalRequests,
} from './lib/health'

const RANGES = [
  { hours: 24, labelKey: 'Last 24 hours' },
  { hours: 168, labelKey: 'Last 7 days' },
] as const

// Swatches for the success-rate scale shared with the model square.
const LEGEND = [
  { rate: 100, label: '100%' },
  { rate: 95, label: '≥ 90%' },
  { rate: 80, label: '≥ 70%' },
  { rate: 10, label: '< 70%' },
]

export function ServiceStatus() {
  const { t } = useTranslation()
  const [hours, setHours] = useState<number>(RANGES[0].hours)
  const health = useGroupHealth(hours)
  const { models, usableGroup } = usePricingData()

  const groups = health.data?.groups ?? []
  const modelsByGroup = countModelsByGroup(models)
  const availability = overallAvailability(groups)
  const requests = totalRequests(groups)
  const degraded = groups.filter((group) => {
    const level = getSuccessRateLevel(group.success_rate)
    return level === 'warning' || level === 'critical'
  }).length
  const hasData = groups.length > 0 && !health.isLoading && !health.isError

  const renderBody = () => {
    if (health.isLoading) {
      return (
        <div
          aria-busy
          aria-label={t('Loading service status')}
          className='border-border divide-border divide-y overflow-hidden rounded-3xl border'
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className='flex flex-col gap-4 px-6 py-5'>
              <Skeleton className='h-5 w-48' />
              <Skeleton className='h-8 w-full' />
              <Skeleton className='h-4 w-2/3' />
            </div>
          ))}
        </div>
      )
    }

    if (health.isError) {
      return (
        <div className='border-border rounded-3xl border border-dashed p-10 text-center'>
          <p className='text-sm font-medium'>
            {t('Unable to load service status')}
          </p>
          <p className='text-muted-foreground mt-1 text-xs'>
            {health.error instanceof Error
              ? health.error.message
              : t('Something went wrong!')}
          </p>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='mt-4'
            onClick={() => void health.refetch()}
          >
            {t('Retry')}
          </Button>
        </div>
      )
    }

    if (groups.length === 0) {
      return (
        <div className='border-border text-muted-foreground rounded-3xl border border-dashed p-12 text-center text-sm'>
          <p className='font-ascii text-muted-foreground/70 mb-2 text-xs'>
            $ status --groups
          </p>
          {t('No service status data available yet')}
        </div>
      )
    }

    return (
      <div className='border-border bg-background divide-border divide-y overflow-hidden rounded-3xl border'>
        {groups.map((group) => (
          <GroupHealthCard
            key={group.group}
            summary={group}
            description={readGroupDescription(usableGroup, group.group)}
            modelCount={modelsByGroup[group.group]}
          />
        ))}
      </div>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <section className='relative px-4 pt-28 pb-20 sm:px-6 lg:pt-32'>
        <div
          aria-hidden
          className='ascii-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)] opacity-40'
        />
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-8'>
          <header className='flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between'>
            <div className='max-w-2xl'>
              <p className='font-ascii text-muted-foreground text-xs tracking-wide uppercase'>
                [ {t('Service Status')} ]
              </p>
              <h1 className='mt-4 text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.05] font-semibold tracking-tight text-balance'>
                {t('Service Status')}
              </h1>
              <p className='text-muted-foreground mt-4 text-base leading-relaxed text-pretty'>
                {hours === 168
                  ? t(
                      'Request results per model group over the last 7 days, rolled up every minute.'
                    )
                  : t(
                      'Request results per model group over the last 24 hours, rolled up every minute.'
                    )}
              </p>
            </div>

            <div
              role='group'
              aria-label={t('Time range')}
              className='bg-muted inline-flex shrink-0 items-center gap-1 self-start rounded-full p-1 sm:self-auto'
            >
              {RANGES.map((range) => {
                const isActive = hours === range.hours
                return (
                  <button
                    key={range.hours}
                    type='button'
                    aria-pressed={isActive}
                    onClick={() => setHours(range.hours)}
                    className={cn(
                      'focus-visible:ring-ring h-9 rounded-full px-4 text-sm font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none',
                      isActive
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t(range.labelKey)}
                  </button>
                )
              })}
            </div>
          </header>

          {hasData && (
            <div className='border-border bg-muted/40 overflow-hidden rounded-3xl border'>
              <div className='flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8'>
                <div className='flex items-center gap-4'>
                  <span aria-hidden className='relative flex size-3 shrink-0'>
                    <span
                      className={cn(
                        'absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping',
                        degraded > 0 ? 'bg-amber-500' : 'bg-landing-accent'
                      )}
                    />
                    <span
                      className={cn(
                        'relative size-3 rounded-full',
                        degraded > 0 ? 'bg-amber-500' : 'bg-landing-accent'
                      )}
                    />
                  </span>
                  <p className='text-xl font-semibold tracking-tight sm:text-2xl'>
                    {degraded > 0
                      ? t('{{count}} groups degraded', { count: degraded })
                      : t('All systems operational')}
                  </p>
                </div>
                <dl className='flex flex-col sm:items-end'>
                  <dt className='text-muted-foreground order-2 text-xs'>
                    {t('Overall availability')}
                  </dt>
                  <dd
                    className={cn(
                      'font-ascii order-1 text-4xl leading-none font-semibold tracking-tight tabular-nums',
                      getSuccessRateTextClass(availability)
                    )}
                  >
                    {formatUptimePct(availability)}
                  </dd>
                </dl>
              </div>
              <dl className='border-border divide-border grid grid-cols-3 divide-x border-t'>
                <div className='flex min-w-0 flex-col gap-1 px-6 py-4 sm:px-8'>
                  <dt className='text-muted-foreground text-[11px] leading-4'>
                    {t('Active groups')}
                  </dt>
                  <dd className='font-ascii text-lg leading-none font-medium tabular-nums'>
                    {formatNumber(groups.length)}
                  </dd>
                </div>
                <div className='flex min-w-0 flex-col gap-1 px-6 py-4 sm:px-8'>
                  <dt className='text-muted-foreground text-[11px] leading-4'>
                    {t('Requests')}
                  </dt>
                  <dd className='font-ascii text-lg leading-none font-medium tabular-nums'>
                    {formatNumber(requests)}
                  </dd>
                </div>
                <div className='flex min-w-0 flex-col gap-1 px-6 py-4 sm:px-8'>
                  <dt className='text-muted-foreground text-[11px] leading-4'>
                    {t('Data refresh')}
                  </dt>
                  <dd className='font-ascii text-muted-foreground truncate text-xs leading-5'>
                    {t('Updated every minute')}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {renderBody()}

          <div className='flex flex-col items-center justify-between gap-3 text-xs sm:flex-row'>
            <ul
              aria-label={t('Success rate')}
              className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2'
            >
              {LEGEND.map((entry) => (
                <li
                  key={entry.label}
                  className='font-ascii inline-flex items-center gap-1.5'
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 rounded-[2px]',
                      getSuccessRateDotClass(entry.rate)
                    )}
                  />
                  {entry.label}
                </li>
              ))}
              <li className='inline-flex items-center gap-1.5'>
                <span aria-hidden className='bg-muted size-2 rounded-[2px]' />
                {t('No data')}
              </li>
            </ul>
            <p className='text-muted-foreground/80 text-center leading-relaxed sm:text-right'>
              {t(
                'Success rate excludes business rejections and includes the current partial hour.'
              )}
            </p>
          </div>
        </div>
      </section>
      <Footer />
    </PublicLayout>
  )
}
