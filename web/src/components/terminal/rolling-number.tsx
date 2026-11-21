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
import { useLayoutEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import {
  formatLikeNumber,
  parseFormattedNumber,
  prefersReducedMotion,
} from './lib'

const ROLL_MS = 720

/**
 * A formatted number that rolls from its previous value to the new one
 * (from 0 the first time it appears), like the counters on the landing page.
 *
 * The caller formats the value (`formatQuota`, `formatNumber`, …); this only
 * animates the digits inside that text and always ends on it exactly. Text
 * without a number, and reduced motion, render as is. A timer backs up the
 * animation frames, which stop in background tabs, so the final text is
 * written even when no frame runs.
 */
export function RollingNumber(props: { text: string; className?: string }) {
  const [shown, setShown] = useState(props.text)
  const settled = useRef<string | null>(null)

  useLayoutEffect(() => {
    const target = parseFormattedNumber(props.text)
    const previous = settled.current
    settled.current = props.text
    if (!target || prefersReducedMotion()) {
      setShown(props.text)
      return
    }
    const from = previous ? (parseFormattedNumber(previous)?.value ?? 0) : 0
    if (from === target.value) {
      setShown(props.text)
      return
    }
    const startedAt = performance.now()
    let frame = 0
    const finish = () => {
      window.cancelAnimationFrame(frame)
      setShown(props.text)
    }
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / ROLL_MS))
      if (progress >= 1) {
        finish()
        return
      }
      const eased = 1 - Math.pow(1 - progress, 4)
      setShown(formatLikeNumber(target, from + (target.value - from) * eased))
      frame = window.requestAnimationFrame(step)
    }
    setShown(formatLikeNumber(target, from))
    frame = window.requestAnimationFrame(step)
    const timer = window.setTimeout(finish, ROLL_MS + 80)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [props.text])

  return (
    <span
      className={cn('[font-variant-numeric:tabular-nums]', props.className)}
    >
      {shown}
    </span>
  )
}
