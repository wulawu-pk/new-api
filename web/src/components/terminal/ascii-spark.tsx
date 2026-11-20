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
import { cn } from '@/lib/utils'

import { sparkHeight } from './lib'

export type SparkCell = {
  /** Stable identity of the period, e.g. its start time. */
  id: string | number
  /** Availability in percent, or null when the period had no requests. */
  value: number | null
  /** Hover text, e.g. "11-20 14:00 · 99.6%". */
  title: string
}

type AsciiSparkProps = {
  cells: SparkCell[]
  label: string
  /** Below this availability a cell is drawn in the warning colour. */
  warnBelow?: number
  className?: string
  cellClassName?: string
}

/**
 * Availability trend: one equal-width CSS column per period.
 *
 * Not drawn with █▆▄ glyphs because their height and weight differ from font
 * to font. An empty period draws only a short baseline.
 */
export function AsciiSpark(props: AsciiSparkProps) {
  const warnBelow = props.warnBelow ?? 99
  return (
    <div
      role='img'
      aria-label={props.label}
      className={cn('flex h-5 items-end gap-[3px]', props.className)}
    >
      {props.cells.map((cell) => {
        if (cell.value == null) {
          return (
            <i
              key={cell.id}
              title={cell.title}
              data-empty='true'
              className={cn(
                'bg-t-dim block h-[2px] min-w-[3px] flex-1 opacity-60',
                props.cellClassName
              )}
            />
          )
        }
        const warn = cell.value < warnBelow
        return (
          <i
            key={cell.id}
            title={cell.title}
            data-warn={warn ? 'true' : undefined}
            className={cn(
              'block min-w-[3px] flex-1',
              warn ? 'bg-t-warn' : 'bg-t-fg2',
              props.cellClassName
            )}
            style={{ height: `${sparkHeight(cell.value).toFixed(0)}%` }}
          />
        )
      })}
    </div>
  )
}
