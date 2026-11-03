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
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import {
  ThemeCustomizationProvider,
  useThemeCustomization,
} from '@/context/theme-customization-provider'
import { DEFAULT_LOGO, DEFAULT_SYSTEM_NAME } from '@/lib/constants'
import {
  DEFAULT_THEME_CUSTOMIZATION,
  THEME_PRESET_VALUES,
  resolveThemeFont,
} from '@/lib/theme-customization'

function PresetButtons() {
  const customization = useThemeCustomization()
  return (
    <>
      <output aria-label='Preset'>{customization.customization.preset}</output>
      <button type='button' onClick={() => customization.setPreset('default')}>
        Upstream preset
      </button>
    </>
  )
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.body.removeAttribute('data-theme-preset')
})

describe('peroai brand defaults', () => {
  it('uses the peroai preset, name and logo by default', () => {
    expect(DEFAULT_THEME_CUSTOMIZATION.preset).toBe('peroai')
    expect(THEME_PRESET_VALUES.has('peroai')).toBe(true)
    expect(THEME_PRESET_VALUES.has('default')).toBe(true)
    expect(resolveThemeFont('default', 'peroai')).toBe('system')
    expect(DEFAULT_SYSTEM_NAME).toBe('peroai')
    expect(DEFAULT_LOGO).toBe('/peroai-logo.svg')
  })

  it('leaves the preset attribute empty for peroai and keeps the upstream preset selectable', async () => {
    const user = userEvent.setup()
    render(
      <ThemeCustomizationProvider>
        <PresetButtons />
      </ThemeCustomizationProvider>
    )

    expect(screen.getByLabelText('Preset')).toHaveTextContent('peroai')
    expect(document.body).not.toHaveAttribute('data-theme-preset')

    await user.click(screen.getByRole('button', { name: 'Upstream preset' }))

    expect(document.body).toHaveAttribute('data-theme-preset', 'default')
    expect(localStorage.getItem('newapi:theme:v1:preset')).toBe('default')
  })
})
