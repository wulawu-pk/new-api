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
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseFormattedNumber } from '../lib'
import { RollingNumber } from '../rolling-number'

const originalMatchMedia = window.matchMedia

function allowMotion() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) =>
      ({ ...originalMatchMedia(query), matches: false }) as MediaQueryList,
  })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
})

describe('parseFormattedNumber', () => {
  it('splits currency, grouped counts and percentages around the number', () => {
    expect(parseFormattedNumber('$1,234.50')).toEqual({
      prefix: '$',
      value: 1234.5,
      decimals: 2,
      grouped: true,
      suffix: '',
    })
    expect(parseFormattedNumber('99.4%')?.suffix).toBe('%')
  })

  it('returns null for text without a number', () => {
    expect(parseFormattedNumber('—')).toBeNull()
  })
})

describe('RollingNumber', () => {
  it('shows the final text at once when reduced motion is preferred', () => {
    render(<RollingNumber text='$12.34' />)

    expect(screen.getByText('$12.34')).toBeInTheDocument()
  })

  describe('with motion allowed', () => {
    beforeEach(() => {
      allowMotion()
      vi.useFakeTimers()
    })

    it('rolls up from zero on first appearance and ends on the exact text', () => {
      render(<RollingNumber text='$12.34' />)
      expect(screen.getByText('$0.00')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(screen.getByText('$12.34')).toBeInTheDocument()
    })

    it('rolls from the previous value, not from zero, when the value changes', () => {
      const view = render(<RollingNumber text='1,200' />)
      act(() => {
        vi.advanceTimersByTime(1000)
      })

      view.rerender(<RollingNumber text='1,500' />)
      expect(screen.getByText('1,200')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(screen.getByText('1,500')).toBeInTheDocument()
    })

    it('renders text without a number unchanged', () => {
      render(<RollingNumber text='—' />)

      expect(screen.getByText('—')).toBeInTheDocument()
    })
  })
})
