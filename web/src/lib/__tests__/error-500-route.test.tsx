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
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderConsole } from '@/features/console/__tests__/render-console'

import { Error500Page } from '../../routes/(errors)/500'

describe('standalone 500 route', () => {
  it('states the status code it is showing', async () => {
    renderConsole(<Error500Page />, '/500')

    expect(
      await screen.findByRole('heading', { name: '500' })
    ).toBeInTheDocument()
    expect(screen.getByText(/peroai: \/500: 500/)).toBeInTheDocument()
    expect(screen.getByText('Oops! Something went wrong')).toBeInTheDocument()
    expect(screen.queryByText(/peroai: \/500: error/)).not.toBeInTheDocument()
  })
})
