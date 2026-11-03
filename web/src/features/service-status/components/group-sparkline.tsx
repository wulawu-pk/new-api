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

import type { GroupSparklinePoint } from '../lib/health'

/**
 * Compact availability strip: one small bar per hourly sample, coloured by the
 * same success-rate scale the model square uses. Bars keep a fixed width so a
 * sparse series never stretches into a misleading "all green" row.
 */
export function GroupSparkline(props: {
  series: GroupSparklinePoint[]
  label: string
  className?: string
}) {
  const { t } = useTranslation()

  if (props.series.length === 0) {
    return (
      <span
        role='img'
        aria-label={t('No availability data available')}
        className={cn('text-muted-foreground text-xs', props.className)}
      >
        —
      </span>
    )
  }

  return (
    <span
      role='img'
      aria-label={props.label}
      className={cn('flex h-4 items-end gap-px', props.className)}
    >
      {props.series.map((point) => (
        <span
          key={point.ts}
          aria-hidden
          title={`${new Date(point.ts * 1000).toISOString()} · ${point.success_rate.toFixed(2)}%`}
          className={cn(
            'h-full w-[3px] shrink-0 rounded-xs',
            getSuccessRateDotClass(point.success_rate)
          )}
        />
      ))}
    </span>
  )
}
