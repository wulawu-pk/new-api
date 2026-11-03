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
import { PageTransition } from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatUptimePct,
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

export function ServiceStatus() {
  const { t } = useTranslation()
  const [hours, setHours] = useState<number>(RANGES[0].hours)
  const health = useGroupHealth(hours)
  const { models, usableGroup } = usePricingData()

  const groups = health.data?.groups ?? []
  const modelsByGroup = countModelsByGroup(models)
  const availability = overallAvailability(groups)
  const requests = totalRequests(groups)

  const renderBody = () => {
    if (health.isLoading) {
      return (
        <div
          aria-busy
          aria-label={t('Loading service status')}
          className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'
        >
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className='h-[188px] rounded-xl' />
          ))}
        </div>
      )
    }

    if (health.isError) {
      return (
        <div className='bg-card rounded-xl border p-6 text-center'>
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
            className='mt-3'
            onClick={() => void health.refetch()}
          >
            {t('Retry')}
          </Button>
        </div>
      )
    }

    if (groups.length === 0) {
      return (
        <div className='bg-card text-muted-foreground rounded-xl border p-10 text-center text-sm'>
          {t('No service status data available yet')}
        </div>
      )
    }

    return (
      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
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
      <div className='relative'>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-x-0 top-0 h-[600px] opacity-20 dark:opacity-[0.10]'
          style={{
            background: [
              'radial-gradient(ellipse 60% 50% at 20% 20%, oklch(0.72 0.18 250 / 80%) 0%, transparent 70%)',
              'radial-gradient(ellipse 50% 40% at 80% 15%, oklch(0.65 0.15 200 / 60%) 0%, transparent 70%)',
              'radial-gradient(ellipse 40% 35% at 50% 70%, oklch(0.70 0.12 280 / 40%) 0%, transparent 70%)',
            ].join(', '),
            maskImage:
              'linear-gradient(to bottom, black 40%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 40%, transparent 100%)',
          }}
        />
        <PageTransition className='relative mx-auto w-full max-w-[1280px] space-y-6 px-3 pt-16 pb-10 sm:px-6 sm:pt-20 sm:pb-12 xl:px-8'>
          <header className='space-y-2'>
            <h1 className='text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.15] font-bold tracking-tight'>
              {t('Service Status')}
            </h1>
            <p className='text-muted-foreground/80 max-w-2xl text-sm'>
              {hours === 168
                ? t(
                    'Request results per model group over the last 7 days, rolled up every minute.'
                  )
                : t(
                    'Request results per model group over the last 24 hours, rolled up every minute.'
                  )}
            </p>
          </header>

          <div
            role='group'
            aria-label={t('Time range')}
            className='border-border/60 flex items-center border-b'
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
                    'focus-visible:ring-ring/40 relative -mb-px rounded-sm px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(range.labelKey)}
                  <span
                    aria-hidden
                    className={cn(
                      'bg-foreground absolute inset-x-3 -bottom-px h-[2px] rounded-full transition-opacity',
                      isActive ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </button>
              )
            })}
          </div>

          {groups.length > 0 && !health.isLoading && !health.isError && (
            <dl className='bg-card grid grid-cols-2 gap-3 rounded-xl border p-4 sm:grid-cols-4'>
              <div className='flex min-w-0 flex-col gap-1'>
                <dt className='text-muted-foreground text-[11px] leading-4'>
                  {t('Overall availability')}
                </dt>
                <dd
                  className={cn(
                    'font-mono text-xl leading-none font-semibold tabular-nums',
                    getSuccessRateTextClass(availability)
                  )}
                >
                  {formatUptimePct(availability)}
                </dd>
              </div>
              <div className='flex min-w-0 flex-col gap-1'>
                <dt className='text-muted-foreground text-[11px] leading-4'>
                  {t('Active groups')}
                </dt>
                <dd className='font-mono text-xl leading-none font-semibold tabular-nums'>
                  {formatNumber(groups.length)}
                </dd>
              </div>
              <div className='flex min-w-0 flex-col gap-1'>
                <dt className='text-muted-foreground text-[11px] leading-4'>
                  {t('Requests')}
                </dt>
                <dd className='font-mono text-xl leading-none font-semibold tabular-nums'>
                  {formatNumber(requests)}
                </dd>
              </div>
              <div className='flex min-w-0 flex-col gap-1'>
                <dt className='text-muted-foreground text-[11px] leading-4'>
                  {t('Data refresh')}
                </dt>
                <dd className='text-muted-foreground font-mono text-xs leading-5'>
                  {t('Updated every minute')}
                </dd>
              </div>
            </dl>
          )}

          {renderBody()}

          <p className='text-muted-foreground/70 text-center text-xs leading-relaxed'>
            {t(
              'Success rate excludes business rejections and includes the current partial hour.'
            )}
          </p>
        </PageTransition>
      </div>
    </PublicLayout>
  )
}
