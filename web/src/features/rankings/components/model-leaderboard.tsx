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
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { formatShare, formatTokens } from '../lib/format'
import type { ModelRanking } from '../types'
import { ModelLink, VendorLink } from './entity-links'
import { GrowthText } from './growth-text'

/** Rank movement against the previous period: up, down, unchanged or new. */
function RankChange(props: { row: ModelRanking }) {
  const { t } = useTranslation()
  if (props.row.previous_rank == null) {
    return (
      <span className='font-ascii text-landing-accent text-[10px] font-semibold'>
        {t('NEW')}
      </span>
    )
  }
  const delta = props.row.previous_rank - props.row.rank
  if (delta === 0) {
    return (
      <Minus
        className='text-muted-foreground/60 size-3'
        aria-label={t('No change')}
      />
    )
  }
  const up = delta > 0
  return (
    <span
      className={cn(
        'font-ascii inline-flex items-center gap-0.5 text-[11px] tabular-nums',
        up
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-rose-600 dark:text-rose-400'
      )}
    >
      {up ? (
        <ArrowUp className='size-3' aria-hidden />
      ) : (
        <ArrowDown className='size-3' aria-hidden />
      )}
      {Math.abs(delta)}
    </span>
  )
}

type ModelLeaderboardProps = {
  rows: ModelRanking[]
  /** Optional cap (rows beyond this are dropped). */
  limit?: number
}

/**
 * Ranked model list: rank and movement, model with vendor, a share bar
 * scaled to the leader, and token volume with period growth.
 *
 * The model name links to `/pricing/{modelName}`, the vendor to
 * `/pricing?vendor={vendor}`.
 */
export function ModelLeaderboard(props: ModelLeaderboardProps) {
  const { t } = useTranslation()
  const rows = props.limit ? props.rows.slice(0, props.limit) : props.rows
  if (rows.length === 0) return null
  const maxShare = Math.max(...rows.map((row) => row.share), 0.0001)

  return (
    <ol className='divide-border divide-y'>
      {rows.map((row) => (
        <li
          key={row.model_name}
          className='hover:bg-muted/40 grid grid-cols-[2rem_2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 px-5 py-3 transition-colors sm:grid-cols-[2rem_2.25rem_minmax(0,1.3fr)_minmax(0,1fr)_7rem] sm:px-6'
        >
          <span className='font-ascii text-muted-foreground text-right text-sm tabular-nums'>
            {String(row.rank).padStart(2, '0')}
          </span>
          <span className='flex justify-center'>
            <RankChange row={row} />
          </span>
          <div className='flex min-w-0 items-center gap-3'>
            <span className='shrink-0'>{getLobeIcon(row.vendor_icon, 20)}</span>
            <div className='min-w-0'>
              <ModelLink
                modelName={row.model_name}
                className='font-ascii text-foreground block truncate text-sm font-medium'
              />
              <p className='text-muted-foreground truncate text-xs'>
                <VendorLink vendor={row.vendor} />
              </p>
            </div>
          </div>
          <div
            className='hidden items-center gap-3 sm:flex'
            title={t('{{share}} of all tokens', {
              share: formatShare(row.share),
            })}
          >
            <span className='bg-muted relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full'>
              <span
                className='bg-landing-accent absolute inset-y-0 left-0 rounded-full'
                style={{ width: `${(row.share / maxShare) * 100}%` }}
              />
            </span>
            <span className='font-ascii text-muted-foreground w-12 shrink-0 text-right text-xs tabular-nums'>
              {formatShare(row.share)}
            </span>
          </div>
          <div className='text-right'>
            <div className='font-ascii text-sm font-semibold tabular-nums'>
              {formatTokens(row.total_tokens)}
            </div>
            <GrowthText value={row.growth_pct} className='text-[11px]' />
          </div>
        </li>
      ))}
    </ol>
  )
}
