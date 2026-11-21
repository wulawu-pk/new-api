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
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import type { RankingMover } from '../types'
import { ModelLink, VendorLink } from './entity-links'
import { GrowthText } from './growth-text'

type PulseSectionProps = {
  movers: RankingMover[]
  droppers: RankingMover[]
}

/**
 * Rank movement panel: gainers and losers against the previous period,
 * side by side inside one frame.
 */
export function PulseSection(props: PulseSectionProps) {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='rankings-pulse-heading'
      className='border-border bg-background overflow-hidden rounded-3xl border'
    >
      <header className='flex flex-col gap-1 px-5 pt-6 pb-4 sm:px-6'>
        <p className='font-ascii text-muted-foreground text-xs'>[ 03 ]</p>
        <h2
          id='rankings-pulse-heading'
          className='text-xl font-semibold tracking-tight sm:text-2xl'
        >
          {t('Rank movement')}
        </h2>
      </header>
      <div className='border-border divide-border grid grid-cols-1 divide-y border-t lg:grid-cols-2 lg:divide-x lg:divide-y-0'>
        <MoverColumn
          title={t('Trending up')}
          description={t('Models climbing the leaderboard')}
          empty={t('No notable climbers right now')}
          rows={props.movers}
          intent='up'
        />
        <MoverColumn
          title={t('Trending down')}
          description={t('Models losing positions')}
          empty={t('No notable drops right now')}
          rows={props.droppers}
          intent='down'
        />
      </div>
    </section>
  )
}

function MoverColumn(props: {
  title: string
  description: string
  empty: string
  rows: RankingMover[]
  intent: 'up' | 'down'
}) {
  const up = props.intent === 'up'
  return (
    <div>
      <div className='px-5 pt-5 pb-2 sm:px-6'>
        <h3
          className={cn(
            'font-ascii inline-flex items-center gap-1.5 text-sm font-semibold',
            up
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'
          )}
        >
          {up ? '▲' : '▼'} {props.title}
        </h3>
        <p className='text-muted-foreground mt-0.5 text-xs'>
          {props.description}
        </p>
      </div>
      {props.rows.length === 0 ? (
        <p className='text-muted-foreground px-6 pt-4 pb-8 text-center text-xs'>
          {props.empty}
        </p>
      ) : (
        <ul className='pb-3'>
          {props.rows.map((row) => (
            <li
              key={row.model_name}
              className='hover:bg-muted/40 flex items-center gap-3 px-5 py-2.5 transition-colors sm:px-6'
            >
              <span className='shrink-0'>
                {getLobeIcon(row.vendor_icon, 20)}
              </span>
              <div className='min-w-0 flex-1'>
                <ModelLink
                  modelName={row.model_name}
                  className='font-ascii text-foreground block truncate text-sm font-medium'
                />
                <p className='text-muted-foreground truncate text-xs'>
                  <span className='font-ascii'>#{row.current_rank}</span> ·{' '}
                  <VendorLink vendor={row.vendor} />
                </p>
              </div>
              <div className='flex shrink-0 flex-col items-end'>
                <span
                  className={cn(
                    'font-ascii inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums',
                    up
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  )}
                >
                  {up ? (
                    <ArrowUpRight className='size-3.5' aria-hidden />
                  ) : (
                    <ArrowDownRight className='size-3.5' aria-hidden />
                  )}
                  {Math.abs(row.rank_delta)}
                </span>
                <GrowthText value={row.growth_pct} className='text-[11px]' />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
