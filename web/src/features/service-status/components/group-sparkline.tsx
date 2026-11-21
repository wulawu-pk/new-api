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

import { getSuccessRateDotClass } from '@/features/performance-metrics/lib/format'
import { cn } from '@/lib/utils'

import { GROUP_SPARKLINE_POINTS, type GroupSparklinePoint } from '../lib/health'

/**
 * Full-width availability strip: a fixed number of hourly slots, newest on
 * the right. Slots without a sample stay muted, so a sparse series never
 * stretches into a misleading "all green" row.
 */
export function GroupSparkline(props: {
  series: GroupSparklinePoint[]
  label: string
  activeTs?: number | null
  onActiveChange?: (point: GroupSparklinePoint | null) => void
  className?: string
}) {
  const { t } = useTranslation()

  if (props.series.length === 0) {
    return (
      <span
        role='img'
        aria-label={t('No availability data available')}
        className={cn(
          'border-border text-muted-foreground flex h-8 w-full items-center justify-center rounded-md border border-dashed text-xs',
          props.className
        )}
      >
        —
      </span>
    )
  }

  const empty = Math.max(GROUP_SPARKLINE_POINTS - props.series.length, 0)

  return (
    <span
      role='img'
      aria-label={props.label}
      onPointerLeave={() => props.onActiveChange?.(null)}
      className={cn(
        'flex h-8 w-full items-stretch gap-px sm:gap-[3px]',
        props.className
      )}
    >
      {Array.from({ length: empty }, (_, index) => (
        <span
          key={`empty-${index}`}
          aria-hidden
          className='bg-muted min-w-0 flex-1 rounded-[3px]'
        />
      ))}
      {props.series.map((point) => (
        <span
          key={point.ts}
          aria-hidden
          onPointerEnter={() => props.onActiveChange?.(point)}
          className={cn(
            'min-w-0 flex-1 rounded-[3px] transition-opacity duration-150',
            getSuccessRateDotClass(point.success_rate),
            props.activeTs != null &&
              props.activeTs !== point.ts &&
              'opacity-40'
          )}
        />
      ))}
    </span>
  )
}
