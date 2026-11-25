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
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as libApi from '@/lib/api'

import { renderConsole } from '../../__tests__/render-console'
import { ApiAddressPane } from '../components/api-address-pane'
import { apiBaseUrl } from '../lib/api-address'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(libApi, 'getStatus').mockResolvedValue({
    server_address: 'https://api.peroai.cc/',
  } as never)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('api base url', () => {
  it('drops the trailing slash and falls back to this origin', () => {
    expect(apiBaseUrl('https://api.peroai.cc/')).toBe('https://api.peroai.cc')
    expect(apiBaseUrl('https://api.example.com/relay/')).toBe(
      'https://api.example.com/relay'
    )
    expect(apiBaseUrl('')).toBe(window.location.origin)
    expect(apiBaseUrl('not a url')).toBe(window.location.origin)
    expect(apiBaseUrl('javascript:alert(1)')).toBe(window.location.origin)
  })
})

describe('api address pane', () => {
  it('shows both addresses and copies the one clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    renderConsole(<ApiAddressPane />)

    expect(
      await screen.findByText('https://api.peroai.cc/v1')
    ).toBeInTheDocument()
    expect(screen.getByText('without /v1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Copy Claude Code$/ }))
    expect(writeText).toHaveBeenLastCalledWith('https://api.peroai.cc')

    await user.click(
      screen.getByRole('button', { name: /^Copy OpenAI compatible/ })
    )
    expect(writeText).toHaveBeenLastCalledWith('https://api.peroai.cc/v1')
  })
})
