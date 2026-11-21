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

import { barFillPercent } from './lib'

type AsciiBarProps = {
  /** Current value. Values above `max` are clamped. */
  value: number
  max?: number
  /** Bar length in monospace character widths (spec: 10 or 14). */
  width?: number
  tone?: 'default' | 'accent'
  /** Accessible label; defaults to the rounded percentage. */
  label?: string
  className?: string
}

/**
 * Proportion bar (cache hit, used quota, price comparison).
 *
 * Drawn with CSS (track + fill) rather than █░ glyphs: font fallback renders
 * those as boxes, and CJK text is not two Latin cells wide, so glyph bars
 * never line up.
 */
export function AsciiBar(props: AsciiBarProps) {
  const pct = barFillPercent(props.value, props.max ?? 100)
  return (
    <span
      role='img'
      aria-label={props.label ?? `${Math.round(pct)}%`}
      className={cn(
        'bg-t-line inline-block h-2 align-middle font-mono',
        props.className
      )}
      style={{ width: `${props.width ?? 10}ch` }}
    >
      <i
        className={cn(
          't-grow-x block h-full',
          props.tone === 'accent' ? 'bg-t-accent' : 'bg-t-fg2'
        )}
        style={{ width: `${pct.toFixed(1)}%` }}
      />
    </span>
  )
}
