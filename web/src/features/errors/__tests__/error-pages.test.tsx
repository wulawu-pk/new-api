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

import { ForbiddenError } from '../forbidden'
import { MaintenanceError } from '../maintenance-error'
import { UnauthorisedError } from '../unauthorized-error'

afterEach(cleanup)

describe('error pages', () => {
  it.each([
    ['403', <ForbiddenError key='403' />, 'Access Forbidden'],
    ['401', <UnauthorisedError key='401' />, 'Unauthorized Access'],
    ['503', <MaintenanceError key='503' />, 'Website is under maintenance!'],
  ])(
    '%s uses the console frame and links back into the site',
    async (code, page, title) => {
      renderConsole(page, `/${code}`)

      expect(
        await screen.findByRole('heading', { name: code })
      ).toBeInTheDocument()
      expect(screen.getByText(title)).toBeInTheDocument()
      expect(
        screen.getByText(new RegExp(`peroai: /${code}: ${code}`))
      ).toBeInTheDocument()
      const places = within(
        screen.getByRole('navigation', { name: 'Where to go' })
      )
      expect(places.getByRole('link', { name: /Home page/ })).toHaveAttribute(
        'href',
        '/'
      )
      expect(
        places.getByRole('button', { name: /Go back/ })
      ).toBeInTheDocument()
      expect(screen.queryByText(/GitHub/)).not.toBeInTheDocument()
    }
  )
})
