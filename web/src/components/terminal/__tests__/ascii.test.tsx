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
  it('draws a baseline for an empty period and grades the others ok, warn or bad', () => {
    render(
      <AsciiSpark
        label='trend'
        cells={[
          { id: 1, value: null, title: 'no requests' },
          { id: 2, value: 100, title: 'full' },
          { id: 3, value: 90, title: 'at the ok line' },
          { id: 4, value: 89.9, title: 'below ok' },
          { id: 5, value: 80, title: 'at the bad line' },
          { id: 6, value: 79.9, title: 'below bad' },
        ]}
      />
    )

    const cells = screen.getByRole('img', { name: 'trend' }).children
    expect(cells[0]).toHaveAttribute('data-empty', 'true')
    expect(cells[0]).not.toHaveAttribute('data-level')
    expect(cells[1]).toHaveAttribute('data-level', 'ok')
    expect(cells[1]).toHaveStyle({ height: '100%' })
    expect(cells[2]).toHaveAttribute('data-level', 'ok')
    expect(cells[3]).toHaveAttribute('data-level', 'warn')
    expect(cells[4]).toHaveAttribute('data-level', 'warn')
    expect(cells[5]).toHaveAttribute('data-level', 'bad')
  })

  it('paints each grade in its status colour', () => {
    render(
      <AsciiSpark
        label='trend'
        cells={[
          { id: 1, value: 96, title: 'ok' },
          { id: 2, value: 85, title: 'warn' },
          { id: 3, value: 70, title: 'bad' },
        ]}
      />
    )

    const cells = screen.getByRole('img', { name: 'trend' }).children
    expect(cells[0]).toHaveClass('bg-t-ok')
    expect(cells[1]).toHaveClass('bg-t-warn')
    expect(cells[2]).toHaveClass('bg-t-bad')
  })

  it('maps 80% or less to the 25% floor and 100% to full height', () => {
    expect(sparkHeight(50)).toBe(25)
    expect(sparkHeight(90)).toBe(62.5)
    expect(sparkHeight(100)).toBe(100)
  })
})
