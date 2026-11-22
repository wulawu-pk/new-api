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

import { createSonar, readAccentRgb } from '../sonar-engine'

// jsdom has no canvas: a 2D context that answers the calls the engine makes
// and counts the glyphs it stamps from the atlas.
let stamps = 0
let clears = 0
function stubContext(): CanvasRenderingContext2D {
  const noop = () => undefined
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_target, key) {
      if (key === 'drawImage') return () => (stamps += 1)
      if (key === 'clearRect') return () => (clears += 1)
      return noop
    },
    set: () => true,
  })
}

let frames: FrameRequestCallback[] = []

beforeEach(() => {
  frames = []
  stamps = 0
  clears = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => stubContext() as never
  )
  vi.spyOn(
    HTMLCanvasElement.prototype,
    'getBoundingClientRect'
  ).mockReturnValue({ width: 1200, height: 700 } as DOMRect)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return frames.length
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Plays `count` frames `gap` ms apart from `start`; returns frames queued after. */
function playFrames(start: number, count: number, gap = 50): number {
  for (let i = 0; i < count; i++) {
    const queued = frames
    frames = []
    for (const cb of queued) cb(start + i * gap)
  }
  return frames.length
}

describe('createSonar', () => {
  it('draws glyphs on refresh and keeps animating while not paused', () => {
    const sonar = createSonar(document.createElement('canvas'))
    sonar.refresh()

    expect(stamps).toBeGreaterThan(0)
    expect(playFrames(performance.now() + 100, 3)).toBeGreaterThan(0)
    sonar.destroy()
  })

  it('redraws on every 60Hz animation frame instead of skipping frames', () => {
    const sonar = createSonar(document.createElement('canvas'))
    sonar.refresh()
    clears = 0

    playFrames(performance.now() + 100, 6, 1000 / 60)

    expect(clears).toBe(6)
    sonar.destroy()
  })

  it('stops requesting frames when paused and resumes when unpaused', () => {
    const sonar = createSonar(document.createElement('canvas'))
    sonar.refresh()

    sonar.setPaused(true)
    expect(playFrames(performance.now() + 100, 1)).toBe(0)

    sonar.setPaused(false)
    expect(frames.length).toBeGreaterThan(0)
    sonar.destroy()
  })

  it('draws one still frame and no animation under reduced motion', () => {
    const sonar = createSonar(document.createElement('canvas'), {
      reducedMotion: true,
    })
    sonar.refresh()

    expect(stamps).toBeGreaterThan(0)
    expect(frames).toHaveLength(0)
    sonar.destroy()
  })
})

describe('sonar helpers', () => {
  it('reads the accent from --t-accent-rgb and falls back to mint', () => {
    const el = document.createElement('div')
    el.style.setProperty('--t-accent-rgb', '91 157 255')
    expect(readAccentRgb(el)).toEqual([91, 157, 255])
    expect(readAccentRgb(document.createElement('div'))).toEqual([61, 219, 165])
  })
})
