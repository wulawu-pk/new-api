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
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { renderConsole } from '@/features/console/__tests__/render-console'

import { NotFoundError } from '../not-found-error'

afterEach(cleanup)

describe('not found page', () => {
  it('echoes the missing path like a shell and offers places to go', async () => {
    renderConsole(<NotFoundError />, '/old-pricing')

    expect(await screen.findByText(/open \/old-pricing/)).toBeInTheDocument()
    expect(
      screen.getByText(/peroai: \/old-pricing: no such page/)
    ).toBeInTheDocument()
    const places = within(
      screen.getByRole('navigation', { name: 'Where to go' })
    )
    expect(places.getByRole('link', { name: /Home page/ })).toHaveAttribute(
      'href',
      '/'
    )
    expect(places.getByRole('link', { name: /Console/ })).toHaveAttribute(
      'href',
      '/dashboard'
    )
  })
})
