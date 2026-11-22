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
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AsciiBar } from '../ascii-bar'
import { AsciiSpark } from '../ascii-spark'
import { barFillPercent, sparkHeight } from '../lib'

afterEach(cleanup)

describe('AsciiBar', () => {
  it('sizes the bar in character widths and labels the rounded percentage', () => {
    render(<AsciiBar value={70} width={14} />)

    const bar = screen.getByRole('img', { name: '70%' })
    expect(bar).toHaveStyle({ width: '14ch' })
    expect(bar.firstElementChild).toHaveStyle({ width: '70.0%' })
  })

  it('keeps a tiny positive value visible and clamps values above the maximum', () => {
    expect(barFillPercent(0.1, 100)).toBe(4)
    expect(barFillPercent(250, 100)).toBe(100)
  })

  it('draws an empty track for zero or a missing maximum', () => {
    expect(barFillPercent(0, 100)).toBe(0)
    expect(barFillPercent(5, 0)).toBe(0)
  })
})

describe('AsciiSpark', () => {
  it('draws a baseline for an empty period and marks low availability as warning', () => {
    render(
      <AsciiSpark
        label='trend'
        cells={[
          { id: 1, value: null, title: 'no requests' },
          { id: 2, value: 98.2, title: 'low' },
          { id: 3, value: 100, title: 'ok' },
        ]}
      />
    )

    const cells = screen.getByRole('img', { name: 'trend' }).children
    expect(cells[0]).toHaveAttribute('data-empty', 'true')
    expect(cells[1]).toHaveAttribute('data-warn', 'true')
    expect(cells[2]).not.toHaveAttribute('data-warn')
    expect(cells[2]).toHaveStyle({ height: '100%' })
  })

  // Dark keeps its original look (text colour, warning below 99%); only the
  // light theme grades the bars green / orange / red.
  it('keeps the dark bars in the text colour with the warning colour below 99%', () => {
    render(
      <AsciiSpark
        label='trend'
        cells={[
          { id: 1, value: 99.5, title: 'ok' },
          { id: 2, value: 96, title: 'low' },
        ]}
      />
    )

    const cells = screen.getByRole('img', { name: 'trend' }).children
    expect(cells[0]).toHaveClass('bg-t-fg2')
    expect(cells[0]).not.toHaveClass('bg-t-ok')
    expect(cells[1]).toHaveClass('bg-t-warn')
  })

  it('grades the light-theme bars at 90% and 80%', () => {
    render(
      <AsciiSpark
        label='trend'
        cells={[
          { id: 1, value: null, title: 'no requests' },
          { id: 2, value: 90, title: 'at the ok line' },
          { id: 3, value: 89.9, title: 'below ok' },
          { id: 4, value: 80, title: 'at the bad line' },
          { id: 5, value: 79.9, title: 'below bad' },
        ]}
      />
    )

    const cells = screen.getByRole('img', { name: 'trend' }).children
    expect(cells[0]).not.toHaveAttribute('data-level')
    expect(cells[1]).toHaveAttribute('data-level', 'ok')
    expect(cells[1]).toHaveClass('light:bg-t-ok')
    expect(cells[2]).toHaveAttribute('data-level', 'warn')
    expect(cells[2]).toHaveClass('light:bg-t-warn')
    expect(cells[3]).toHaveAttribute('data-level', 'warn')
    expect(cells[4]).toHaveAttribute('data-level', 'bad')
    expect(cells[4]).toHaveClass('light:bg-t-bad')
  })

  it('maps 80% or less to the 25% floor and 100% to full height', () => {
    expect(sparkHeight(50)).toBe(25)
    expect(sparkHeight(90)).toBe(62.5)
    expect(sparkHeight(100)).toBe(100)
  })
})
