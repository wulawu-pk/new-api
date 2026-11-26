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
import { afterEach, describe, expect, it } from 'vitest'

import { groupName, ratioLabel, sortGroups } from '../groups'
import {
  findConsoleWindow,
  isAccountPath,
  isConsolePath,
  isShortcutTarget,
} from '../windows'

afterEach(() => {
  document.body.innerHTML = ''
})

const identity = (key: string) => key

describe('console windows', () => {
  it('maps the six console routes to windows, with or without a trailing slash', () => {
    expect(findConsoleWindow('/dashboard')?.key).toBe('dash')
    expect(findConsoleWindow('/keys/')?.key).toBe('keys')
    expect(findConsoleWindow('/usage-logs')?.key).toBe('logs')
    expect(findConsoleWindow('/pricing')?.key).toBe('models')
    expect(findConsoleWindow('/status')?.key).toBe('status')
  })

  it('renders the account pages in the console shell without a numbered window', () => {
    expect(isConsolePath('/profile')).toBe(true)
    expect(isConsolePath('/security/')).toBe(true)
    expect(findConsoleWindow('/profile')).toBeUndefined()
    expect(isAccountPath('/security')).toBe(true)
    expect(isAccountPath('/keys')).toBe(false)
  })

  it('leaves admin and sub-pages in the old layout', () => {
    expect(isConsolePath('/dashboard/models')).toBe(false)
    expect(isConsolePath('/usage-logs/common')).toBe(false)
    expect(isConsolePath('/pricing/gpt-6')).toBe(false)
    expect(isConsolePath('/channels')).toBe(false)
  })

  it('ignores shortcuts typed into inputs or while a dialog is open', () => {
    const input = document.createElement('input')
    document.body.append(input)
    expect(isShortcutTarget(new KeyboardEvent('keydown', { key: '1' }))).toBe(
      true
    )

    const typed = new KeyboardEvent('keydown', { key: '1' })
    Object.defineProperty(typed, 'target', { value: input })
    expect(isShortcutTarget(typed)).toBe(false)

    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    expect(isShortcutTarget(new KeyboardEvent('keydown', { key: '1' }))).toBe(
      false
    )
  })

  it('does not treat modifier combinations as shortcuts', () => {
    expect(
      isShortcutTarget(
        new KeyboardEvent('keydown', { key: '1', ctrlKey: true })
      )
    ).toBe(false)
  })
})

describe('groups', () => {
  it('orders known groups first and unknown groups alphabetically after them', () => {
    expect(
      sortGroups(['zeta', 'deepseek', 'gpt-pro', 'alpha', 'gemini-ultra'])
    ).toEqual(['gpt-pro', 'gemini-ultra', 'deepseek', 'alpha', 'zeta'])
  })

  it('quotes credit groups per credit and others by ratio', () => {
    expect(ratioLabel('claude-kiro', 1.85)).toBe('$0.25 / credit')
    expect(ratioLabel('gpt-pro', 0.5)).toBe('×0.5')
    expect(ratioLabel('gpt-pro', undefined)).toBe('')
  })

  it('falls back to the server description, then the key, for unknown groups', () => {
    expect(groupName('gpt-pro', identity)).toBe('GPT Enterprise')
    expect(groupName('new-group', identity, '新分组')).toBe('新分组')
    expect(groupName('new-group', identity)).toBe('new-group')
  })
})
