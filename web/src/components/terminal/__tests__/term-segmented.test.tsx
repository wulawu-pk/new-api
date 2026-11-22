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
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TermSegmented } from '../term-segmented'

const ITEMS = [
  { value: 'day', label: '24 hours' },
  { value: 'week', label: '7 days' },
]

const animate = vi.fn()
const originalMatchMedia = window.matchMedia
const nativeGeometry = Object.getOwnPropertyDescriptors(HTMLElement.prototype)

/** jsdom lays nothing out: choices sit 80px apart and are 72px wide. */
const geometry = {
  animate: { configurable: true, value: animate },
  offsetLeft: {
    configurable: true,
    get(this: HTMLElement) {
      const group = this.closest('[role="group"]')
      if (!group || !this.dataset.seg) return 0
      return 4 + [...group.querySelectorAll('[data-seg]')].indexOf(this) * 80
    },
  },
  offsetWidth: {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.seg ? 72 : 0
    },
  },
} satisfies PropertyDescriptorMap

function setReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) =>
      ({ ...originalMatchMedia(query), matches: reduce }) as MediaQueryList,
  })
}

function pill(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.t-seg-mark')
  if (!el) throw new Error('pill not rendered')
  return el
}

/** Keyframe transforms of the last slide played on the pill. */
function lastSlide(): string[] | undefined {
  const index = animate.mock.contexts.lastIndexOf(pill())
  if (index < 0) return undefined
  return (animate.mock.calls[index][0] as Keyframe[]).map((frame) =>
    String(frame.transform)
  )
}

function Range(props: { initial?: string; memoryKey?: string }) {
  const [value, setValue] = useState(props.initial ?? 'day')
  return (
    <TermSegmented
      label='Time range'
      items={ITEMS}
      value={value}
      onValueChange={setValue}
      memoryKey={props.memoryKey}
    />
  )
}

beforeEach(() => {
  Object.defineProperties(HTMLElement.prototype, geometry)
  setReducedMotion(false)
})

afterEach(() => {
  cleanup()
  animate.mockReset()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
  for (const key of Object.keys(geometry)) {
    const native = nativeGeometry[key]
    if (native) Object.defineProperty(HTMLElement.prototype, key, native)
    else Reflect.deleteProperty(HTMLElement.prototype, key)
  }
})

describe('TermSegmented', () => {
  it('places the pill on the chosen item without sliding on first render', () => {
    render(<Range />)

    expect(pill().style.transform).toBe('translateX(4px)')
    expect(pill().style.width).toBe('72px')
    expect(animate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '24 hours' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('slides the pill to a clicked item and marks it pressed', () => {
    render(<Range />)

    fireEvent.click(screen.getByRole('button', { name: '7 days' }))

    expect(lastSlide()).toEqual(['translateX(4px)', 'translateX(84px)'])
    expect(pill().style.transform).toBe('translateX(84px)')
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('slides on from the previous spot when a remembered control mounts again on the other choice', () => {
    render(<Range memoryKey='range-remount' initial='day' />)
    cleanup()
    animate.mockClear()

    render(<Range memoryKey='range-remount' initial='week' />)

    expect(lastSlide()).toEqual(['translateX(4px)', 'translateX(84px)'])
  })

  it('still slides across the remount after the old page was open for a while', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
    render(<Range memoryKey='range-long-visit' initial='day' />)
    now.mockReturnValue(60_000)
    cleanup()
    animate.mockClear()

    now.mockReturnValue(60_050)
    render(<Range memoryKey='range-long-visit' initial='week' />)

    expect(lastSlide()).toEqual(['translateX(4px)', 'translateX(84px)'])
    now.mockRestore()
  })

  it('does not slide from a spot left by a visit long ago', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
    render(<Range memoryKey='range-old-visit' initial='day' />)
    cleanup()
    animate.mockClear()

    now.mockReturnValue(60_000)
    render(<Range memoryKey='range-old-visit' initial='week' />)

    expect(animate).not.toHaveBeenCalled()
    now.mockRestore()
  })

  it('does not slide a control without a memory key when it mounts again', () => {
    render(<Range initial='day' />)
    cleanup()
    animate.mockClear()

    render(<Range initial='week' />)

    expect(animate).not.toHaveBeenCalled()
    expect(pill().style.transform).toBe('translateX(84px)')
  })

  it('jumps without sliding when reduced motion is preferred', () => {
    setReducedMotion(true)
    render(<Range />)

    fireEvent.click(screen.getByRole('button', { name: '7 days' }))

    expect(animate).not.toHaveBeenCalled()
    expect(pill().style.transform).toBe('translateX(84px)')
  })
})
