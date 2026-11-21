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

import { createRelay } from '../relay-engine'

// jsdom has no canvas: a 2D context that answers the calls the engine makes
// (sizes, image data for the logo mask, gradients) and records the text it
// writes.
let written: string[] = []
function stubContext(): CanvasRenderingContext2D {
  const noop = () => undefined
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_target, key) {
      if (key === 'fillText') return (text: string) => written.push(text)
      if (key === 'measureText') return () => ({ width: 7 })
      if (key === 'getImageData') {
        return (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
        })
      }
      if (key === 'createLinearGradient') return () => ({ addColorStop: noop })
      return noop
    },
    set: () => true,
  })
}

let frames: FrameRequestCallback[] = []

beforeEach(() => {
  frames = []
  written = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => stubContext() as never
  )
  vi.spyOn(
    HTMLCanvasElement.prototype,
    'getBoundingClientRect'
  ).mockReturnValue({ width: 800, height: 400 } as DOMRect)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return frames.length
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Runs the frames queued so far; returns how many new ones they queued. */
function runQueuedFrames(): number {
  const queued = frames
  frames = []
  for (const cb of queued) cb(performance.now() + 100)
  return frames.length
}

describe('createRelay', () => {
  it('keeps animating after refresh while it is not paused', () => {
    const relay = createRelay(document.createElement('canvas'), null)
    relay.refresh()

    expect(frames.length).toBeGreaterThan(0)
    expect(runQueuedFrames()).toBeGreaterThan(0)
    relay.destroy()
  })

  it('stops requesting frames when paused and resumes when unpaused', () => {
    const relay = createRelay(document.createElement('canvas'), null)
    relay.refresh()

    relay.setPaused(true)
    expect(runQueuedFrames()).toBe(0)

    relay.setPaused(false)
    expect(frames.length).toBeGreaterThan(0)
    relay.destroy()
  })
})

/** Plays `count` frames 50ms apart, starting from `start`. */
function playFrames(start: number, count: number) {
  for (let i = 0; i < count; i++) {
    const queued = frames
    frames = []
    for (const cb of queued) cb(start + i * 50)
  }
}

const REQUEST_TEXT = new Set([
  'peroai init',
  'POST /v1',
  'sk-new',
  '200 OK',
  'ready',
])

describe('createRelay request text', () => {
  it('writes the text of requests along the lanes by default', () => {
    const relay = createRelay(document.createElement('canvas'), null)
    relay.refresh()
    relay.burst()

    playFrames(performance.now(), 60)

    expect(written.some((text) => REQUEST_TEXT.has(text))).toBe(true)
    relay.destroy()
  })

  it('writes no request text as a quiet page backdrop', () => {
    const relay = createRelay(document.createElement('canvas'), null, {
      backdrop: true,
    })
    relay.refresh()
    relay.burst()

    playFrames(performance.now(), 60)

    expect(written.some((text) => REQUEST_TEXT.has(text))).toBe(false)
    relay.destroy()
  })
})
