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

import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { formatTokens } from '../lib/format'
import type { RankingPeriod, RankingsSnapshot } from '../types'
import { ModelLink } from './entity-links'

const PERIODS: { id: RankingPeriod; labelKey: string }[] = [
  { id: 'today', labelKey: 'Today' },
  { id: 'week', labelKey: 'Week' },
  { id: 'month', labelKey: 'Month' },
  { id: 'year', labelKey: 'Year' },
]

type RankingsHeroProps = {
  period: RankingPeriod
  onPeriodChange: (period: RankingPeriod) => void
  snapshot?: RankingsSnapshot
}

/**
 * Statement header for the rankings page: title, period switch, and a strip
 * of headline figures computed from the loaded snapshot.
 */
export function RankingsHero(props: RankingsHeroProps) {
  const { t } = useTranslation()
  const snapshot = props.snapshot
  const totalTokens =
    snapshot?.models.reduce((sum, row) => sum + row.total_tokens, 0) ?? 0
  const leader = snapshot?.models[0]

  return (
    <section className='flex flex-col gap-10'>
      <div className='flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between'>
        <div className='max-w-2xl'>
          <p className='font-ascii text-muted-foreground text-xs tracking-wide uppercase'>
            [ {t('Rankings')} ]
          </p>
          <h1 className='mt-4 text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.05] font-semibold tracking-tight text-balance'>
            {t('Rankings')}
          </h1>
          <p className='text-muted-foreground mt-4 text-base leading-relaxed text-pretty'>
            {t(
              'Discover the most-used models and rising vendors on the platform, updated from live usage data.'
            )}
          </p>
        </div>

        <div
          role='tablist'
          aria-label={t('Period')}
          className='bg-muted inline-flex shrink-0 items-center gap-1 self-start rounded-full p-1 lg:self-auto'
        >
          {PERIODS.map((p) => {
            const isActive = props.period === p.id
            return (
              <button
                key={p.id}
                role='tab'
                type='button'
                aria-selected={isActive}
                onClick={() => props.onPeriodChange(p.id)}
                className={cn(
                  'focus-visible:ring-ring h-9 rounded-full px-4 text-sm font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none',
                  isActive
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t(p.labelKey)}
              </button>
            )
          })}
        </div>
      </div>

      {snapshot && (
        <dl className='border-border lg:divide-border grid grid-cols-2 gap-y-8 border-y py-8 lg:grid-cols-4 lg:divide-x'>
          <div className='flex flex-col gap-2 px-1 lg:px-6 lg:first:pl-0'>
            <dt className='text-muted-foreground order-2 text-xs tracking-[0.12em] uppercase'>
              {t('Tokens served')}
            </dt>
            <dd className='font-ascii order-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl'>
              {formatTokens(totalTokens)}
            </dd>
          </div>
          <div className='flex flex-col gap-2 px-1 lg:px-6'>
            <dt className='text-muted-foreground order-2 text-xs tracking-[0.12em] uppercase'>
              {t('Models ranked')}
            </dt>
            <dd className='font-ascii order-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl'>
              {formatNumber(snapshot.models.length)}
            </dd>
          </div>
          <div className='flex flex-col gap-2 px-1 lg:px-6'>
            <dt className='text-muted-foreground order-2 text-xs tracking-[0.12em] uppercase'>
              {t('Vendors')}
            </dt>
            <dd className='font-ascii order-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl'>
              {formatNumber(snapshot.vendors.length)}
            </dd>
          </div>
          <div className='flex min-w-0 flex-col gap-2 px-1 lg:px-6'>
            <dt className='text-muted-foreground order-2 text-xs tracking-[0.12em] uppercase'>
              {t('Top model')}
            </dt>
            <dd className='font-ascii order-1 truncate text-xl font-semibold tracking-tight sm:text-2xl lg:leading-10'>
              {leader ? <ModelLink modelName={leader.model_name} /> : '—'}
            </dd>
          </div>
        </dl>
      )}
    </section>
  )
}
