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
/** Fill percentage for a bar; any positive value gets at least 4% so it shows. */
export function barFillPercent(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0
  return Math.min(100, Math.max(4, (value / max) * 100))
}

/**
 * Bar height for an availability value: 80% or lower draws at the 25% floor,
 * 100% fills. Matches the beta landing page.
 */
export function sparkHeight(value: number): number {
  return 25 + 75 * Math.max(0, Math.min(1, (value - 80) / 20))
}

/** Whether the user asked the system for reduced motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Frames of the submit-button spinner. */
export const SPIN_FRAMES = ['|', '/', '-', '\\'] as const

/** Turns an unknown query error into a short reason string. */
export function errorReason(error: unknown): string | undefined {
  if (!error) return undefined
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string') return error
  return undefined
}

export type ParsedNumber = {
  prefix: string
  value: number
  decimals: number
  grouped: boolean
  suffix: string
}

/** Splits an already formatted value such as "$1,234.50" or "99.4%". */
export function parseFormattedNumber(text: string): ParsedNumber | null {
  const match = /^([^\d-]*)(-?\d[\d,]*(?:\.\d+)?)(.*)$/.exec(text.trim())
  if (!match) return null
  const digits = match[2]
  const value = Number(digits.replaceAll(',', ''))
  if (!Number.isFinite(value)) return null
  return {
    prefix: match[1],
    value,
    decimals: (digits.split('.')[1] ?? '').length,
    grouped: digits.includes(','),
    suffix: match[3],
  }
}

/** Writes `value` in the shape of a parsed number (prefix, decimals, grouping, suffix). */
export function formatLikeNumber(target: ParsedNumber, value: number): string {
  let digits = value.toFixed(target.decimals)
  if (target.grouped) {
    const [whole, fraction] = digits.split('.')
    digits =
      whole.replaceAll(/\B(?=(\d{3})+(?!\d))/g, ',') +
      (fraction ? `.${fraction}` : '')
  }
  return target.prefix + digits + target.suffix
}
