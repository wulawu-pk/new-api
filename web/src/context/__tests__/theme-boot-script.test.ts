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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { THEME_STORAGE_KEYS } from '@/lib/theme-storage'

// The inline script in index.html must apply the theme class (and the page
// language) before React mounts; Dark Reader checks `html.dark` only once
// while the page loads. peroai fork: the rules are shared with the beta
// landing page and docs — saved light / dark wins, "system" follows the OS,
// nothing saved means dark; a saved zh* language means Chinese, else English,
// and with nothing saved the browser language decides.
const html = readFileSync(
  resolve(import.meta.dirname, '../../../index.html'),
  'utf8'
)
const bootScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''

function runBootScript() {
  new Function(bootScript)()
}

function mockSystemDarkMode(dark: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: dark && query === '(prefers-color-scheme: dark)',
        media: query,
      }) as MediaQueryList
  )
}

const root = document.documentElement

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  root.classList.remove('light', 'dark')
  root.lang = ''
})

describe('index.html theme boot script', () => {
  it('applies light before React mounts when the saved preference is light', () => {
    mockSystemDarkMode(true)
    localStorage.setItem(THEME_STORAGE_KEYS.mode, 'light')
    root.classList.add('dark')

    runBootScript()

    expect(root).toHaveClass('light')
    expect(root).not.toHaveClass('dark')
  })

  it('applies dark when the system is light and nothing is saved', () => {
    mockSystemDarkMode(false)

    runBootScript()

    expect(root).toHaveClass('dark')
    expect(root).not.toHaveClass('light')
  })

  it('follows a light system when the saved preference is system', () => {
    mockSystemDarkMode(false)
    localStorage.setItem(THEME_STORAGE_KEYS.mode, 'system')

    runBootScript()

    expect(root).toHaveClass('light')
  })

  it('falls back to dark when storage cannot be read', () => {
    mockSystemDarkMode(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    runBootScript()

    expect(root).toHaveClass('dark')
  })
})

describe('index.html language boot script', () => {
  it('marks the page Chinese for a saved zh* language', () => {
    localStorage.setItem('i18nextLng', 'zhCN')

    runBootScript()

    expect(root.lang).toBe('zh-CN')
  })

  it('marks the page English for any other saved language', () => {
    localStorage.setItem('i18nextLng', 'fr')

    runBootScript()

    expect(root.lang).toBe('en')
  })

  it('uses the browser language when nothing is saved', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-TW')

    runBootScript()

    expect(root.lang).toBe('zh-CN')
  })
})
