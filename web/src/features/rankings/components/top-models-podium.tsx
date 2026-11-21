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
import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'

import { formatShare, formatTokens } from '../lib/format'
import type { ModelHistorySeries, ModelRanking } from '../types'
import { ModelLink, VendorLink } from './entity-links'
import { GrowthText } from './growth-text'

const CHART_W = 240
const CHART_H = 56
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** Line and area paths for one model's token volume per history bucket. */
function sparkPaths(values: number[]) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const step = (CHART_W - 8) / (values.length - 1)
  const points = values.map((value, index) => ({
    x: 4 + index * step,
    y: CHART_H - 4 - (value / max) * (CHART_H - 12),
  }))
  const line = points
    .map(
      (p, index) =>
        `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`
    )
    .join(' ')
  const last = points.at(-1)
  if (!last) return null
  const area = `${line} L${last.x.toFixed(1)} ${CHART_H - 4} L4 ${CHART_H - 4} Z`
  return { line, area, last }
}

type TopModelsPodiumProps = {
  rows: ModelRanking[]
  history: ModelHistorySeries
}

/**
 * The three most-used models of the period as large cards, each with its
 * token volume, share, period growth and a sparkline of its history buckets.
 */
export function TopModelsPodium(props: TopModelsPodiumProps) {
  const { t } = useTranslation()
  const reduce = useReducedMotion()
  const podium = props.rows.slice(0, 3)

  const seriesByModel = useMemo(() => {
    const buckets = [...new Set(props.history.points.map((p) => p.ts))].sort()
    const index = new Map(buckets.map((ts, i) => [ts, i] as const))
    const result = new Map<string, number[]>()
    for (const point of props.history.points) {
      let values = result.get(point.model)
      if (!values) {
        values = Array.from({ length: buckets.length }, () => 0)
        result.set(point.model, values)
      }
      values[index.get(point.ts) ?? 0] += point.tokens
    }
    return result
  }, [props.history])

  if (podium.length === 0) return null

  return (
    <section aria-labelledby='rankings-podium-heading'>
      <h2 id='rankings-podium-heading' className='sr-only'>
        {t('Top Models')}
      </h2>
      <ol className='grid grid-cols-1 gap-3 md:grid-cols-3'>
        {podium.map((row, position) => {
          const paths = sparkPaths(seriesByModel.get(row.model_name) ?? [])
          return (
            <motion.li
              key={row.model_name}
              initial={{ opacity: 0, y: reduce ? 0 : 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE, delay: position * 0.06 }}
              className='border-border bg-background flex min-w-0 flex-col rounded-3xl border p-6 transition-transform duration-300 hover:-translate-y-0.5'
            >
              <div className='flex items-center justify-between gap-3'>
                <span className='font-ascii text-landing-accent text-sm font-semibold'>
                  #{row.rank}
                </span>
                <span className='border-border inline-flex items-center rounded-full border px-2.5 py-1 text-xs'>
                  <GrowthText value={row.growth_pct} />
                </span>
              </div>

              <div className='mt-5 flex min-w-0 items-center gap-3'>
                <span className='border-border flex size-10 shrink-0 items-center justify-center rounded-xl border'>
                  {getLobeIcon(row.vendor_icon, 22)}
                </span>
                <div className='min-w-0'>
                  <ModelLink
                    modelName={row.model_name}
                    className='font-ascii block truncate text-base font-semibold'
                  />
                  <p className='text-muted-foreground truncate text-xs'>
                    <VendorLink vendor={row.vendor} />
                  </p>
                </div>
              </div>

              <p className='mt-6 flex items-baseline gap-2'>
                <span className='font-ascii text-4xl font-semibold tracking-tight tabular-nums'>
                  {formatTokens(row.total_tokens)}
                </span>
                <span className='text-muted-foreground text-sm'>
                  {t('tokens')}
                </span>
              </p>
              <p className='text-muted-foreground mt-1 text-sm'>
                {t('{{share}} of all tokens', {
                  share: formatShare(row.share),
                })}
              </p>

              <div className='border-border mt-6 border-t pt-5'>
                {paths ? (
                  <svg
                    viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                    className='h-auto w-full'
                    aria-hidden
                  >
                    <line
                      x1='4'
                      y1={CHART_H - 4}
                      x2={CHART_W - 4}
                      y2={CHART_H - 4}
                      stroke='currentColor'
                      vectorEffect='non-scaling-stroke'
                      className='text-border'
                    />
                    <motion.path
                      d={paths.area}
                      fill='currentColor'
                      initial={{ opacity: reduce ? 1 : 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.8, delay: 0.3 }}
                      className='text-landing-accent/10'
                    />
                    <motion.path
                      d={paths.line}
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      vectorEffect='non-scaling-stroke'
                      initial={{ pathLength: reduce ? 1 : 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1.1, ease: EASE, delay: 0.2 }}
                      className='text-landing-accent'
                    />
                    <circle
                      cx={paths.last.x}
                      cy={paths.last.y}
                      r='3'
                      fill='currentColor'
                      className='text-landing-accent'
                    />
                  </svg>
                ) : (
                  <p className='text-muted-foreground font-ascii text-xs'>
                    {t('No history data available')}
                  </p>
                )}
              </div>
            </motion.li>
          )
        })}
      </ol>
    </section>
  )
}
