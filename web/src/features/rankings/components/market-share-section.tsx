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
import { VChart } from '@visactor/react-vchart'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useChartTheme } from '@/lib/use-chart-theme'
import { VCHART_OPTION } from '@/lib/vchart'

import { formatShare, formatTokens } from '../lib/format'
import type { RankingPeriod, VendorRanking, VendorShareSeries } from '../types'
import { VendorLink } from './entity-links'

const PERIOD_DESCRIPTIONS: Record<RankingPeriod, string> = {
  today: 'Token share by model author across the last 24 hours',
  week: 'Token share by model author across the past few weeks',
  month: 'Token share by model author across the past month',
  year: 'Token share by model author across the past year',
}

/** Stable colour palette for vendors, used in both the share chart and the
 * legend dots. Falls back to a neutral palette for unknown vendors so that
 * future additions still render. */
const VENDOR_COLOURS: Record<string, string> = {
  OpenAI: '#10a37f',
  Anthropic: '#d97757',
  Google: '#4285f4',
  DeepSeek: '#7c5cff',
  Alibaba: '#ff9900',
  xAI: '#1f2937',
  Meta: '#1877f2',
  Moonshot: '#ec4899',
  Zhipu: '#06b6d4',
  Mistral: '#ff7000',
  ByteDance: '#3b82f6',
  Tencent: '#22c55e',
  MiniMax: '#a855f7',
  Cohere: '#fb923c',
  Baidu: '#ef4444',
  Others: '#94a3b8',
}

const FALLBACK_PALETTE = [
  '#0ea5e9',
  '#22c55e',
  '#a855f7',
  '#f97316',
  '#14b8a6',
  '#eab308',
  '#ec4899',
  '#84cc16',
  '#6366f1',
  '#10b981',
  '#f43f5e',
  '#0891b2',
  '#94a3b8',
]

function buildVendorColourMap(names: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  let fallbackIdx = 0
  for (const name of names) {
    if (VENDOR_COLOURS[name]) {
      result[name] = VENDOR_COLOURS[name]
    } else {
      result[name] = FALLBACK_PALETTE[fallbackIdx % FALLBACK_PALETTE.length]
      fallbackIdx += 1
    }
  }
  return result
}

const MAX_VENDORS_IN_LIST = 12

type MarketShareSectionProps = {
  history: VendorShareSeries
  rows: VendorRanking[]
  period: RankingPeriod
}

/**
 * Combined "Market Share" card: a 100%-stacked bar chart showing each
 * vendor's slice of total token volume, paired below with a two-column
 * vendor list.
 */
export function MarketShareSection(props: MarketShareSectionProps) {
  const { t } = useTranslation()
  const { resolvedTheme, themeReady } = useChartTheme()
  const chartTextColor =
    resolvedTheme === 'dark'
      ? 'rgba(255, 255, 255, 0.68)'
      : 'rgba(15, 23, 42, 0.58)'
  const chartGridColor =
    resolvedTheme === 'dark'
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(15, 23, 42, 0.12)'

  // Vendors in the list but absent from the history still get a stable colour.
  const colourMap = useMemo(
    () =>
      buildVendorColourMap([
        ...new Set([
          ...props.history.vendors.map((v) => v.name),
          ...props.rows.map((v) => v.vendor),
        ]),
      ]),
    [props.history, props.rows]
  )

  const orderedPoints = useMemo(() => {
    const order = new Map(
      props.history.vendors.map((v, idx) => [v.name, idx] as const)
    )
    return [...props.history.points].sort((a, b) => {
      const tsCmp = a.ts.localeCompare(b.ts)
      if (tsCmp !== 0) return tsCmp
      return (order.get(a.vendor) ?? 999) - (order.get(b.vendor) ?? 999)
    })
  }, [props.history])

  const spec = useMemo(() => {
    if (orderedPoints.length === 0) return null
    return {
      type: 'bar' as const,
      data: [{ id: 'vendor-share', values: orderedPoints }],
      xField: 'label',
      yField: 'share',
      seriesField: 'vendor',
      stack: true,
      paddingInner: 0.12,
      legends: { visible: false },
      color: { specified: colourMap },
      axes: [
        {
          orient: 'bottom',
          label: {
            style: { fill: chartTextColor, fontSize: 10 },
            autoHide: true,
            autoLimit: true,
          },
          tick: { visible: false },
        },
        {
          orient: 'left',
          min: 0,
          max: 1,
          label: {
            formatMethod: (val: number | string) =>
              `${Math.round(Number(val) * 100)}%`,
            style: { fill: chartTextColor, fontSize: 10 },
          },
          grid: {
            visible: true,
            style: { lineDash: [3, 3], stroke: chartGridColor },
          },
        },
      ],
      tooltip: {
        mark: {
          content: [
            {
              key: (datum: Record<string, unknown>) =>
                String(datum?.vendor ?? ''),
              value: (datum: Record<string, unknown>) =>
                `${(Number(datum?.share) * 100).toFixed(1)}% · ${formatTokens(Number(datum?.tokens) || 0)}`,
            },
          ],
        },
        dimension: {
          title: {
            value: (datum: Record<string, unknown>) =>
              String(datum?.label ?? ''),
          },
          content: [
            {
              key: (datum: Record<string, unknown>) =>
                String(datum?.vendor ?? ''),
              value: (datum: Record<string, unknown>) =>
                Number(datum?.share) || 0,
            },
          ],
          updateContent: (
            array: Array<{ key: string; value: string | number }>
          ) => {
            return array
              .filter((item) => Number(item.value) > 0.001)
              .sort((a, b) => Number(b.value) - Number(a.value))
              .map((item) => ({
                key: item.key,
                value: `${(Number(item.value) * 100).toFixed(1)}%`,
              }))
          },
        },
      },
      animationAppear: { duration: 500 },
    }
  }, [chartGridColor, chartTextColor, colourMap, orderedPoints])

  const visible = props.rows.slice(0, MAX_VENDORS_IN_LIST)
  const otherShare = Math.max(
    1 - visible.reduce((sum, vendor) => sum + vendor.share, 0),
    0
  )

  return (
    <section
      aria-labelledby='rankings-share-heading'
      className='border-border bg-background overflow-hidden rounded-3xl border'
    >
      <header className='flex flex-col gap-1 px-5 pt-6 pb-4 sm:px-6'>
        <p className='font-ascii text-muted-foreground text-xs'>[ 02 ]</p>
        <h2
          id='rankings-share-heading'
          className='text-xl font-semibold tracking-tight sm:text-2xl'
        >
          {t('Market Share')}
        </h2>
        <p className='text-muted-foreground text-sm'>
          {t(PERIOD_DESCRIPTIONS[props.period])}
        </p>
      </header>

      {visible.length > 0 && (
        <div className='px-5 pb-2 sm:px-6'>
          <div
            role='img'
            aria-label={t('Vendors ranked by aggregated token volume')}
            className='flex h-3 w-full gap-[2px] overflow-hidden rounded-full'
          >
            {visible.map((vendor) => (
              <span
                key={vendor.vendor}
                title={`${vendor.vendor} · ${formatShare(vendor.share)}`}
                className='h-full min-w-[3px]'
                style={{
                  flexGrow: vendor.share,
                  backgroundColor: colourMap[vendor.vendor] ?? '#94a3b8',
                }}
              />
            ))}
            {otherShare > 0.001 && (
              <span
                className='bg-muted h-full min-w-[3px]'
                style={{ flexGrow: otherShare }}
              />
            )}
          </div>
        </div>
      )}

      <div className='grid grid-cols-1 lg:grid-cols-12'>
        <div className='h-64 px-3 py-4 sm:h-80 sm:px-4 lg:col-span-7'>
          {themeReady && spec ? (
            <VChart
              key={`vendor-share-${resolvedTheme}-${props.period}`}
              spec={{
                ...spec,
                theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                background: 'transparent',
              }}
              option={VCHART_OPTION}
            />
          ) : (
            <div className='text-muted-foreground font-ascii flex h-full items-center justify-center text-xs'>
              {t('No history data available')}
            </div>
          )}
        </div>

        <div className='border-border border-t lg:col-span-5 lg:border-t-0 lg:border-l'>
          <header className='px-5 pt-5 pb-3 sm:px-6'>
            <h3 className='text-base font-semibold tracking-tight'>
              {t('By model author')}
            </h3>
            <p className='text-muted-foreground mt-0.5 text-xs'>
              {t('Vendors ranked by aggregated token volume')}
            </p>
          </header>
          {visible.length === 0 ? (
            <div className='text-muted-foreground px-6 py-10 text-center text-sm'>
              {t('No vendor data available')}
            </div>
          ) : (
            <ol className='divide-border border-border divide-y border-t'>
              {visible.map((vendor) => (
                <li
                  key={vendor.vendor}
                  className='hover:bg-muted/40 flex items-center gap-3 px-5 py-2.5 transition-colors sm:px-6'
                >
                  <span className='font-ascii text-muted-foreground w-6 shrink-0 text-right text-xs tabular-nums'>
                    {String(vendor.rank).padStart(2, '0')}
                  </span>
                  <span
                    aria-hidden
                    className='size-2.5 shrink-0 rounded-[3px]'
                    style={{
                      backgroundColor: colourMap[vendor.vendor] ?? '#94a3b8',
                    }}
                  />
                  <div className='min-w-0 flex-1'>
                    <VendorLink
                      vendor={vendor.vendor}
                      className='text-foreground block truncate text-sm font-medium'
                    />
                    <p className='font-ascii text-muted-foreground truncate text-[11px]'>
                      {t('{{count}} models', { count: vendor.models_count })}
                      {vendor.top_model && ` · ${vendor.top_model}`}
                    </p>
                  </div>
                  <div className='shrink-0 text-right'>
                    <div className='font-ascii text-sm font-semibold tabular-nums'>
                      {formatTokens(vendor.total_tokens)}
                    </div>
                    <div className='font-ascii text-muted-foreground text-[11px] tabular-nums'>
                      {formatShare(vendor.share)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  )
}
