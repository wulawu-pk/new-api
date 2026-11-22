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
import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Pane } from '@/components/terminal/pane'
import { cn } from '@/lib/utils'

import { groupName } from '../../lib/groups'
import { groupRatioLabel, type PriceGroup } from '../lib/price-rows'

const NEXT_KEYS = new Set(['ArrowDown', 'ArrowRight', 'j'])
const PREV_KEYS = new Set(['ArrowUp', 'ArrowLeft', 'k'])

type GroupListProps = {
  groups: PriceGroup[]
  /** Key of the group shown on the right; none while searching. */
  selected: string | undefined
  /** Matching models per group while a search is active. */
  matches?: Record<string, number>
  onSelect: (key: string) => void
}

/**
 * Moves a slide block onto `row` (hides it without one). The first time it
 * shows it is put straight on the row instead of flying in from the top;
 * after that the CSS transition slides it on the spring.
 */
function placeMark(mark: HTMLElement | null, row: HTMLElement | null) {
  if (!mark) return
  if (!row || row.offsetWidth === 0) {
    mark.dataset.on = 'false'
    return
  }
  const instant = mark.dataset.on !== 'true'
  if (instant) mark.style.transition = 'none'
  mark.style.width = `${row.offsetWidth}px`
  mark.style.height = `${row.offsetHeight}px`
  mark.style.transform = `translate(${row.offsetLeft}px, ${row.offsetTop}px)`
  if (instant) {
    void mark.offsetWidth
    mark.style.transition = ''
  }
  mark.dataset.on = 'true'
}

/**
 * Group picker of the model plaza: one line per group with its ratio and
 * model count, moving like the landing page's model list: the rows drop in
 * one after another, a block slides on the spring to the row under the
 * pointer and another to the selected row (a glowing accent dot, a light
 * sweeping across it now and then). ↑/↓ (or j/k) move between groups. On
 * phones it becomes a row of chips that scrolls sideways.
 *
 * Plain buttons with `aria-pressed` (as the old filter chips) rather than
 * `ui/tabs`: the list also shows per-group search counts and dims groups
 * without matches, and the panel on the right is not always one tab panel
 * (a search shows several groups).
 */
export function GroupList(props: GroupListProps) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)
  const selectedMark = useRef<HTMLElement>(null)
  const hoverMark = useRef<HTMLElement>(null)

  // The selected block follows the selection (and the rows as they reflow:
  // search counts, a resized window).
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const place = () => {
      const row = props.selected
        ? list.querySelector<HTMLElement>(`[data-group="${props.selected}"]`)
        : null
      placeMark(selectedMark.current, row)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [props.selected, props.groups, props.matches])

  const onPointerOver = (event: PointerEvent<HTMLDivElement>) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-group]'
    )
    if (row) placeMark(hoverMark.current, row)
  }
  const onPointerLeave = () => placeMark(hoverMark.current, null)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let step = 0
    if (NEXT_KEYS.has(event.key)) step = 1
    if (PREV_KEYS.has(event.key)) step = -1
    if (step === 0 || props.groups.length === 0) return
    event.preventDefault()
    const index = props.groups.findIndex((g) => g.key === props.selected)
    const nextIndex =
      (Math.max(index, 0) + step + props.groups.length) % props.groups.length
    const next = props.groups[nextIndex]
    props.onSelect(next.key)
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-group="${next.key}"]`)
      ?.focus()
  }

  return (
    <Pane
      title={<b>{t('Groups')}</b>}
      className='max-md:border-0 max-md:bg-transparent max-md:bg-none max-md:p-0 max-md:shadow-none max-md:[&>.t-pane-title]:hidden'
    >
      <div
        ref={listRef}
        role='group'
        aria-label={t('Model groups')}
        onKeyDown={onKeyDown}
        onPointerOver={onPointerOver}
        onPointerLeave={onPointerLeave}
        className='relative flex flex-col px-2 py-2.5 max-md:[scrollbar-width:none] max-md:flex-row max-md:gap-1.5 max-md:overflow-x-auto max-md:p-0'
      >
        <i
          ref={hoverMark}
          aria-hidden='true'
          data-kind='hover'
          className='t-pick-mark max-md:hidden'
        />
        <i
          ref={selectedMark}
          aria-hidden='true'
          data-kind='selected'
          className='t-pick-mark max-md:hidden'
        />
        {props.groups.map((group, index) => {
          const active = group.key === props.selected
          const count = props.matches
            ? (props.matches[group.key] ?? 0)
            : group.rows.length
          const empty = props.matches !== undefined && count === 0
          return (
            <button
              key={group.key}
              type='button'
              data-group={group.key}
              aria-pressed={active}
              onClick={() => props.onSelect(group.key)}
              style={{ '--i': Math.min(index, 25) } as CSSProperties}
              className={cn(
                't-row-in relative z-[1] grid grid-cols-[12px_minmax(0,1fr)_auto] items-baseline gap-x-1.5 rounded-[var(--t-radius)] px-2.5 py-[7px] text-left text-sm whitespace-nowrap',
                'max-md:border-t-line max-md:flex max-md:shrink-0 max-md:items-center max-md:border max-md:px-2.5 max-md:py-1.5',
                active
                  ? 'text-t-fg max-md:border-t-accent max-md:bg-t-bg3'
                  : 'text-t-fg2 hover:text-t-fg',
                empty && 'text-t-dim'
              )}
            >
              <span
                aria-hidden='true'
                className='flex items-center self-center max-md:hidden'
              >
                {active ? <i className='t-pick-dot' /> : null}
              </span>
              <span className='truncate max-md:overflow-visible'>
                {groupName(group.key, t, group.description)}
              </span>
              <span className='text-t-dim font-mono text-[12px] max-md:hidden'>
                {props.matches ? '' : groupRatioLabel(group, t)}
              </span>
              <span className='text-t-dim col-start-2 font-mono text-[11.5px] max-md:hidden'>
                {props.matches
                  ? t('{{count}} matches', { count })
                  : t('{{count}} models', { count })}
              </span>
            </button>
          )
        })}
      </div>
    </Pane>
  )
}
