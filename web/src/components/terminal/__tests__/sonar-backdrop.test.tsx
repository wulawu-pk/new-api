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
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SonarBackdrop } from '../sonar-backdrop'

const engine = vi.hoisted(() => ({
  created: 0,
  destroyed: 0,
  paused: [] as boolean[],
}))

vi.mock('../sonar-engine', () => ({
  createSonar: () => {
    engine.created += 1
    return {
      refresh: () => undefined,
      setPaused: (p: boolean) => engine.paused.push(p),
      destroy: () => {
        engine.destroyed += 1
      },
    }
  },
}))

beforeEach(() => {
  engine.created = 0
  engine.destroyed = 0
  engine.paused = []
  vi.useFakeTimers()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({}) as never
  )
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('SonarBackdrop', () => {
  // Pages 5 (models) and 6 (status) render their own console shell, so a
  // tab switch unmounts one backdrop and mounts another. The sonar must
  // carry on from where it was instead of starting over.
  it('keeps the same sonar and canvas when one page replaces another', () => {
    const first = render(<SonarBackdrop />)
    const canvas = first.container.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(engine.created).toBe(1)

    first.unmount()
    const second = render(<SonarBackdrop />)

    expect(engine.created).toBe(1)
    expect(engine.destroyed).toBe(0)
    expect(second.container.querySelector('canvas')).toBe(canvas)
    second.unmount()
  })

  it('stops the sonar once no page shows it any more', () => {
    const view = render(<SonarBackdrop />)
    view.unmount()
    expect(engine.destroyed).toBe(0)

    act(() => {
      vi.runAllTimers()
    })

    expect(engine.destroyed).toBe(1)
    render(<SonarBackdrop />).unmount()
    expect(engine.created).toBe(2)
  })

  it('passes the paused flag of the page showing it', () => {
    const view = render(<SonarBackdrop paused />)
    expect(engine.paused.at(-1)).toBe(true)
    view.rerender(<SonarBackdrop paused={false} />)
    expect(engine.paused.at(-1)).toBe(false)
    view.unmount()
  })
})
