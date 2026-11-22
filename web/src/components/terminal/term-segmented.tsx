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
import { Link } from '@tanstack/react-router'
import { useLayoutEffect, useRef, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { prefersReducedMotion, SLIDE_EASE, SLIDE_MS } from './lib'

export type SegmentItem = {
  value: string
  label: ReactNode
  /** Route of this choice; the item is then a link instead of a button. */
  to?: string
  /** Search params for `to` (kept when switching between routes). */
  search?: Record<string, string | undefined>
}

type Spot = { x: number; w: number }

/**
 * Where each remembered control's pill was, and when. A control whose
 * choices are separate routes (sign in / sign up, the legal documents) is
 * mounted again on every switch; the new one slides on from here.
 */
const remembered = new Map<string, Spot & { at: number }>()
/** A remembered spot older than this belongs to an earlier visit. */
const REMEMBER_MS = 1500

/**
 * Two or three choices in a pill track, with a lifted pill that slides on
 * the console spring to the chosen one (the window bar's motion).
 *
 * `components/ui/tabs` is not reused: it owns tab panels and roving focus
 * for in-page panels, while these choices are often separate routes
 * (links) or a filter button group (`aria-pressed`), and the pill has to
 * keep sliding across a remount. `ui/toggle-group` has no moving marker.
 */
export function TermSegmented(props: {
  /** Accessible name of the group. */
  label: string
  items: readonly SegmentItem[]
  value: string
  onValueChange?: (value: string) => void
  /** Name to carry the pill position across a remount (route choices). */
  memoryKey?: string
  className?: string
}) {
  const groupRef = useRef<HTMLDivElement>(null)
  const markRef = useRef<HTMLSpanElement>(null)
  const lastSpot = useRef<Spot | null>(null)
  const memoryKey = props.memoryKey

  // When the control goes away (its route was left), note where the pill
  // was and when, however long the page had been open. The next page's
  // control mounts in the same commit, after this runs.
  useLayoutEffect(
    () => () => {
      if (!memoryKey || !lastSpot.current) return
      remembered.set(memoryKey, { ...lastSpot.current, at: performance.now() })
    },
    [memoryKey]
  )

  useLayoutEffect(() => {
    const group = groupRef.current
    const mark = markRef.current
    if (!group || !mark) return
    const active = [...group.querySelectorAll<HTMLElement>('[data-seg]')].find(
      (el) => el.dataset.seg === props.value
    )
    if (!active) {
      mark.style.opacity = '0'
      return
    }
    const place = (): Spot => {
      const spot = { x: active.offsetLeft, w: active.offsetWidth }
      mark.style.width = `${spot.w}px`
      mark.style.transform = `translateX(${spot.x}px)`
      mark.style.opacity = '1'
      return spot
    }

    const memory = memoryKey ? remembered.get(memoryKey) : undefined
    const recent =
      memory && performance.now() - memory.at < REMEMBER_MS ? memory : null
    const from = lastSpot.current ?? recent
    const to = place()
    lastSpot.current = to

    const moved = from !== null && (from.x !== to.x || from.w !== to.w)
    if (
      moved &&
      typeof mark.animate === 'function' &&
      !prefersReducedMotion()
    ) {
      mark.animate(
        [
          { transform: `translateX(${from.x}px)`, width: `${from.w}px` },
          { transform: `translateX(${to.x}px)`, width: `${to.w}px` },
        ],
        { duration: SLIDE_MS, easing: SLIDE_EASE }
      )
    }

    // Labels change width when the font or language loads; follow them
    // without animating.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      lastSpot.current = place()
    })
    observer.observe(group)
    return () => observer.disconnect()
  }, [props.value, memoryKey])

  return (
    <div
      ref={groupRef}
      role='group'
      aria-label={props.label}
      className={cn(
        'relative inline-flex rounded-full bg-white/4 p-1 shadow-[inset_0_0_0_1px_var(--t-hair)]',
        props.className
      )}
    >
      <span
        ref={markRef}
        aria-hidden='true'
        className='t-seg-mark'
        style={{ opacity: 0 }}
      />
      {props.items.map((item) => {
        const active = item.value === props.value
        const className = cn(
          'relative z-[1] rounded-full px-3.5 py-1.5 text-[13px] whitespace-nowrap transition-colors duration-200',
          'focus-visible:ring-(--t-accent)/60 focus-visible:ring-2 focus-visible:outline-none',
          active ? 'text-t-fg' : 'text-t-dim hover:text-t-fg'
        )
        if (item.to) {
          return (
            <Link
              key={item.value}
              to={item.to}
              search={item.search}
              data-seg={item.value}
              aria-current={active ? 'page' : undefined}
              className={className}
            >
              {item.label}
            </Link>
          )
        }
        return (
          <button
            key={item.value}
            type='button'
            data-seg={item.value}
            aria-pressed={active}
            onClick={() => props.onValueChange?.(item.value)}
            className={className}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
