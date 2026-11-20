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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SpinButton } from '../spin-button'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SpinButton', () => {
  it('shows the plain label and is not busy while idle', () => {
    render(
      <SpinButton state='idle' label='Sign in' pendingLabel='Signing in' />
    )

    const button = screen.getByRole('button', { name: 'Sign in' })
    expect(button).not.toHaveAttribute('aria-busy')
    expect(button).not.toHaveAttribute('aria-disabled')
  })

  it('rotates the spinner glyph while pending and marks itself busy', () => {
    vi.useFakeTimers()
    render(
      <SpinButton state='pending' label='Sign in' pendingLabel='Signing in' />
    )

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveTextContent('| Signing in')
    act(() => {
      vi.advanceTimersByTime(90)
    })
    expect(button).toHaveTextContent('/ Signing in')
  })

  it('shows a check mark with the done label once finished', () => {
    render(
      <SpinButton
        state='done'
        label='Sign in'
        pendingLabel='Signing in'
        doneLabel='Signed in'
      />
    )

    expect(screen.getByRole('button')).toHaveTextContent('✓ Signed in')
  })
})
