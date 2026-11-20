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

import { toIntlLocale } from '@/i18n/languages'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { DaySpend } from '../lib/overview-data'

/**
 * Spending of the last 7 days as CSS columns (one per day, today in pink).
 * Heights are relative to the busiest day; a day without spend shows a
 * 1px baseline.
 */
export function WeekChart(props: { days: DaySpend[] }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  const max = Math.max(0, ...props.days.map((day) => day.quota))
  return (
    <div>
      <div className='grid h-[170px] grid-cols-7 items-end gap-2.5 px-[18px] pt-[18px]'>
        {props.days.map((day, index) => {
          const today = index === props.days.length - 1
          const height = max > 0 ? Math.max(1, (day.quota / max) * 100) : 0
          return (
            <div
              key={day.start}
              className='text-t-dim flex h-full flex-col items-center justify-end gap-1.5 font-mono text-[11.5px]'
            >
              <span className='whitespace-nowrap'>
                {day.quota > 0 ? formatQuota(day.quota) : '—'}
              </span>
              <span
                data-testid='week-column'
                className={cn(
                  'block w-full max-w-7',
                  today ? 'bg-t-pink' : 'bg-t-fg2',
                  day.quota <= 0 && 'bg-t-faint h-px'
                )}
                style={day.quota > 0 ? { height: `${height}%` } : undefined}
              />
            </div>
          )
        })}
      </div>
      <div className='text-t-dim grid grid-cols-7 gap-2.5 px-[18px] pt-2 pb-4 text-center text-xs'>
        {props.days.map((day, index) => (
          <span key={day.start}>
            {index === props.days.length - 1
              ? t('Today')
              : weekday.format(new Date(day.start * 1000))}
          </span>
        ))}
      </div>
    </div>
  )
}
