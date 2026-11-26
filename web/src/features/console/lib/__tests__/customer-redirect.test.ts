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
import { describe, expect, it } from 'vitest'

import { customerConsoleRedirect } from '../windows'

describe('customer console redirect', () => {
  it('keeps customers on console shell pages', () => {
    for (const path of [
      '/dashboard',
      '/keys',
      '/usage-logs',
      '/usage-logs/',
      '/wallet',
      '/profile',
      '/security',
    ]) {
      expect(customerConsoleRedirect(path, false)).toBe(null)
    }
  })

  it('sends customers away from pages with the old admin layout', () => {
    expect(customerConsoleRedirect('/dashboard/overview', false)).toBe(
      '/dashboard'
    )
    expect(customerConsoleRedirect('/dashboard/users', false)).toBe(
      '/dashboard'
    )
    expect(customerConsoleRedirect('/usage-logs/common', false)).toBe(
      '/usage-logs'
    )
    expect(customerConsoleRedirect('/usage-logs/task', false)).toBe(
      '/usage-logs'
    )
    expect(customerConsoleRedirect('/usage-logs/audit', false)).toBe(
      '/usage-logs'
    )
    expect(customerConsoleRedirect('/playground', false)).toBe('/dashboard')
    expect(customerConsoleRedirect('/chat/1', false)).toBe('/dashboard')
    expect(customerConsoleRedirect('/chat2link', false)).toBe('/dashboard')
    expect(customerConsoleRedirect('/errors/forbidden', false)).toBe(
      '/dashboard'
    )
  })

  it('leaves administrators on every page', () => {
    for (const path of [
      '/dashboard/overview',
      '/usage-logs/task',
      '/playground',
      '/channels',
      '/system-settings/site',
    ]) {
      expect(customerConsoleRedirect(path, true)).toBe(null)
    }
  })
})
