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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSignal } from '../signal-engine'

// jsdom has no canvas: a 2D context that answers every call and counts the
// frames the engine clears, and the grid's stroke colours.
let clears = 0
let strokes: string[] = []
function stubContext(): CanvasRenderingContext2D {
  const noop = () => undefined
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_target, key) {
      if (key === 'clearRect') return () => (clears += 1)
      if (key === 'createRadialGradient' || key === 'createLinearGradient') {
        return () => ({ addColorStop: noop })
      }
      return noop
    },
    set(_target, key, value) {
      if (key === 'strokeStyle') strokes.push(String(value))
      return true
    },
  })
}

let frames: FrameRequestCallback[] = []
let now = 1000

beforeEach(() => {
  frames = []
  clears = 0
  strokes = []
  now = 1000
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => stubContext() as never
  )
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.documentElement.classList.remove('light')
  document.documentElement.style.removeProperty('--fx-ink-rgb')
})

/** Plays queued frames 16 ms apart until none is queued or `limit` is hit. */
function playUntilIdle(limit = 400): number {
  let played = 0
  while (frames.length && played < limit) {
    const queued = frames
    frames = []
    now += 16
    for (const cb of queued) cb(now)
    played++
  }
  return played
}

function scrollBy(dy: number) {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value: (window.scrollY || 0) + dy,
  })
  window.dispatchEvent(new Event('scroll'))
}

describe('createSignal', () => {
  it('draws the grid once on start and then requests no frames while nobody acts', () => {
    const signal = createSignal(document.createElement('canvas'))

    playUntilIdle()

    expect(clears).toBe(1)
    expect(frames).toHaveLength(0)
    signal?.destroy()
  })

  it('animates while the page scrolls and goes still once the streaks fade', () => {
    const signal = createSignal(document.createElement('canvas'))
    playUntilIdle()
    clears = 0

    scrollBy(400)
    const played = playUntilIdle()

    expect(clears).toBeGreaterThan(1)
    expect(played).toBeLessThan(400)
    expect(frames).toHaveLength(0)
    signal?.destroy()
  })

  it('starts a ripple when bare page is clicked but not when a link is clicked', () => {
    const signal = createSignal(document.createElement('canvas'))
    playUntilIdle()
    const link = document.createElement('a')
    link.href = '#x'
    const text = document.createElement('p')
    document.body.append(link, text)

    link.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(frames).toHaveLength(0)

    text.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(frames.length).toBeGreaterThan(0)
    signal?.destroy()
  })

  it('ignores clicks inside the extra selector passed by the page', () => {
    const signal = createSignal(document.createElement('canvas'), {
      ignore: '.t-pane',
    })
    playUntilIdle()
    const pane = document.createElement('div')
    pane.className = 't-pane'
    document.body.append(pane)

    pane.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(frames).toHaveLength(0)
    signal?.destroy()
  })

  it('answers neither scrolling nor clicks under reduced motion', () => {
    const signal = createSignal(document.createElement('canvas'), {
      reducedMotion: true,
    })
    playUntilIdle()
    clears = 0

    scrollBy(400)
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(frames).toHaveLength(0)
    expect(clears).toBe(0)
    signal?.destroy()
  })

  it('stops listening after destroy', () => {
    const signal = createSignal(document.createElement('canvas'))
    playUntilIdle()

    signal?.destroy()
    scrollBy(400)

    expect(frames).toHaveLength(0)
  })

  it('returns null when the canvas has no 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    expect(createSignal(document.createElement('canvas'))).toBeNull()
  })
})

describe('createSignal theme', () => {
  it('draws the fine grid in white at the dark-theme alpha', () => {
    const signal = createSignal(document.createElement('canvas'))
    playUntilIdle()

    expect(strokes[0]).toBe('rgba(255,255,255,0.05)')
    signal?.destroy()
  })

  it('redraws in the dark ink when <html> switches to the light theme', async () => {
    const signal = createSignal(document.createElement('canvas'), {
      reducedMotion: true,
    })
    playUntilIdle()
    strokes = []

    document.documentElement.style.setProperty('--fx-ink-rgb', '17 20 24')
    document.documentElement.classList.add('light')
    await Promise.resolve()
    playUntilIdle()

    expect(strokes[0]?.startsWith('rgba(17,20,24,')).toBe(true)
    signal?.destroy()
  })
})
