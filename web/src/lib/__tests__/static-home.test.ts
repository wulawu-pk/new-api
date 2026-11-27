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
import { afterEach, describe, expect, it, vi } from 'vitest'

const realWindow = window

function mockNavigationEntry(name: string | undefined) {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue(
    name ? ([{ name }] as unknown as PerformanceEntry[]) : []
  )
}

async function loadStaticHome(entryPath: string) {
  realWindow.history.replaceState({}, '', entryPath)
  vi.resetModules()
  return import('../static-home')
}

afterEach(() => {
  vi.restoreAllMocks()
  realWindow.history.replaceState({}, '', '/')
})

describe('static landing handoff', () => {
  it('asks for a full document load when the document booted elsewhere', async () => {
    mockNavigationEntry('https://example.test/setup')

    const { shouldReloadStaticHome } = await loadStaticHome('/somewhere')

    expect(shouldReloadStaticHome()).toBe(true)
  })

  it.each([
    'https://example.test/',
    'https://example.test/?foo=1',
    'https://example.test/#top',
  ])(
    'keeps the SPA when the document booted at the landing page (%s)',
    async (name) => {
      mockNavigationEntry(name)

      const { shouldReloadStaticHome } = await loadStaticHome('/keys')

      expect(shouldReloadStaticHome()).toBe(false)
    }
  )

  it('falls back to the boot path when no navigation entry exists', async () => {
    mockNavigationEntry(undefined)
    const fromKeys = await loadStaticHome('/keys')
    expect(fromKeys.shouldReloadStaticHome()).toBe(true)

    mockNavigationEntry(undefined)
    const fromRoot = await loadStaticHome('/')
    expect(fromRoot.shouldReloadStaticHome()).toBe(false)
  })
})
