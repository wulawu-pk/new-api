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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LANGUAGE_EVENT } from '@/hooks/use-change-language'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { LanguageToggle } from '../language-toggle'

beforeEach(async () => {
  await i18next.changeLanguage('en')
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
})

afterEach(async () => {
  vi.restoreAllMocks()
  useAuthStore.getState().auth.setUser(null)
  await i18next.changeLanguage('en')
})

function pressed(name: string) {
  const group = screen.getByRole('group', { name: 'Language' })
  return within(group).getByRole('button', { name })
}

describe('LanguageToggle', () => {
  it('marks EN as chosen in an English interface', () => {
    render(<LanguageToggle />)

    expect(pressed('EN')).toHaveAttribute('aria-pressed', 'true')
    expect(pressed('中')).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks 中 as chosen for any Chinese interface language', async () => {
    await i18next.changeLanguage('zhTW')
    render(<LanguageToggle />)

    expect(pressed('中')).toHaveAttribute('aria-pressed', 'true')
  })

  it('switches to Simplified Chinese on 中 and back to English on EN', async () => {
    const user = userEvent.setup()
    const announced: unknown[] = []
    const onLang = (event: Event) =>
      announced.push((event as CustomEvent).detail)
    document.addEventListener(LANGUAGE_EVENT, onLang)
    render(<LanguageToggle />)

    await user.click(pressed('中'))
    expect(i18next.language).toBe('zhCN')
    expect(pressed('中')).toHaveAttribute('aria-pressed', 'true')

    await user.click(pressed('EN'))
    expect(i18next.language).toBe('en')
    expect(announced).toEqual(['zhCN', 'en'])
    document.removeEventListener(LANGUAGE_EVENT, onLang)
  })

  it('saves the language to the account only when signed in', async () => {
    const user = userEvent.setup()
    render(<LanguageToggle />)

    await user.click(pressed('中'))
    expect(api.put).not.toHaveBeenCalled()

    useAuthStore.getState().auth.setUser({ id: 1, username: 'alice', role: 1 })
    await user.click(pressed('EN'))
    expect(api.put).toHaveBeenCalledWith('/api/user/self', { language: 'en' })
  })
})
