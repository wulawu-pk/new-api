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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/context/theme-provider'

import { THEME_EVENT, ThemeToggle } from '../theme-toggle'

const MODE_KEY = 'newapi:theme:v1:mode'
const root = document.documentElement

function renderToggle() {
  return render(
    <ThemeProvider defaultTheme='dark'>
      <ThemeToggle />
    </ThemeProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  root.classList.remove('light', 'dark', 'theme-anim')
})

describe('ThemeToggle', () => {
  it('offers the light theme while dark, the default with nothing saved', () => {
    renderToggle()

    expect(root).toHaveClass('dark')
    expect(
      screen.getByRole('button', { name: 'Switch to light theme' })
    ).toBeInTheDocument()
  })

  it('switches to light on press: saves light, flips the html class and announces it', async () => {
    const user = userEvent.setup()
    const announced: unknown[] = []
    const onTheme = (event: Event) =>
      announced.push((event as CustomEvent).detail)
    document.addEventListener(THEME_EVENT, onTheme)
    renderToggle()

    await user.click(
      screen.getByRole('button', { name: 'Switch to light theme' })
    )

    expect(localStorage.getItem(MODE_KEY)).toBe('light')
    expect(root).toHaveClass('light')
    expect(root).not.toHaveClass('dark')
    expect(announced).toEqual(['light'])
    expect(
      screen.getByRole('button', { name: 'Switch to dark theme' })
    ).toBeInTheDocument()
    document.removeEventListener(THEME_EVENT, onTheme)
  })

  it('switches back to dark and saves dark from a saved light theme', async () => {
    const user = userEvent.setup()
    localStorage.setItem(MODE_KEY, 'light')
    renderToggle()

    await user.click(
      screen.getByRole('button', { name: 'Switch to dark theme' })
    )

    expect(localStorage.getItem(MODE_KEY)).toBe('dark')
    expect(root).toHaveClass('dark')
  })

  it('adds no colour transition under reduced motion', async () => {
    const user = userEvent.setup()
    renderToggle()

    await user.click(
      screen.getByRole('button', { name: 'Switch to light theme' })
    )

    // test-setup reports prefers-reduced-motion: reduce.
    expect(root).not.toHaveClass('theme-anim')
  })
})
