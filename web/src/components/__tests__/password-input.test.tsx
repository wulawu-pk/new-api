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
import { afterEach, describe, expect, it } from 'vitest'

import { PasswordInput } from '../password-input'

afterEach(() => {
  cleanup()
})

describe('PasswordInput', () => {
  it('hides the value until the visibility toggle is pressed, then shows it', () => {
    render(<PasswordInput aria-label='Password' defaultValue='secret' />)
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')

    fireEvent.click(
      screen.getByRole('button', { name: 'Toggle password visibility' })
    )

    expect(input).toHaveAttribute('type', 'text')
  })

  // The toggle sits inside the field's right edge; typed text must stop
  // before it rather than run underneath (the browser's own reveal eye is
  // hidden in styles/index.css, which jsdom does not apply).
  it('reserves room on the right of the field for the toggle', () => {
    render(<PasswordInput aria-label='Password' />)

    expect(screen.getByLabelText('Password')).toHaveClass('pe-9')
  })
})
