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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { extractRedemptionCode } from '@/features/wallet/lib/redemption-code'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { Redeem, redeemReturnPath } from '..'

// The public header needs status, notifications and a full route tree; the
// page body is what this suite covers.
vi.mock('@/components/layout', () => ({
  PublicLayout: (props: { children?: unknown }) => props.children,
}))

const CODE = '0123456789abcdef0123456789abcdef'

function renderRedeem(initialCode?: string) {
  const root = createRootRoute({ component: Outlet })
  const page = createRoute({
    getParentRoute: () => root,
    path: '/redeem',
    component: () => <Redeem initialCode={initialCode} />,
  })
  const stub = (path: string) =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: () => <div>{path} page</div>,
    })
  const router = createRouter({
    routeTree: root.addChildren([
      page,
      stub('/sign-in'),
      stub('/sign-up'),
      stub('/keys'),
      stub('/wallet'),
    ]),
    history: createMemoryHistory({ initialEntries: ['/redeem'] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset('idle')
})

describe('extractRedemptionCode', () => {
  it('pulls the 32-character code out of pasted text or a link', () => {
    expect(extractRedemptionCode(`  ${CODE}  `)).toBe(CODE)
    expect(extractRedemptionCode(CODE.toUpperCase())).toBe(CODE)
    expect(extractRedemptionCode(`卡密：${CODE}`)).toBe(CODE)
    expect(
      extractRedemptionCode(`https://peroai.cc/redeem?code=${CODE}&x=1`)
    ).toBe(CODE)
  })

  it('leaves anything that is not a code for the server to reject', () => {
    expect(extractRedemptionCode(' abc ')).toBe('abc')
    expect(extractRedemptionCode(`${CODE}0`)).toBe(`${CODE}0`)
    expect(extractRedemptionCode('')).toBe('')
  })
})

describe('redeem page', () => {
  it('sends a signed-out visitor to sign in with the code kept in the return path', async () => {
    const post = vi.spyOn(api, 'post')
    renderRedeem(CODE)

    const signIn = await screen.findByRole('button', { name: 'Sign in' })
    expect(signIn).toHaveAttribute(
      'href',
      `/sign-in?redirect=${encodeURIComponent(`/redeem?code=${CODE}`)}`
    )
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
      'href',
      `/sign-up?redirect=${encodeURIComponent(`/redeem?code=${CODE}`)}`
    )
    expect(screen.queryByRole('button', { name: 'Activate' })).toBeNull()
    expect(post).not.toHaveBeenCalled()
  })

  it('activates the prefilled code for a signed-in user and shows the new balance', async () => {
    useAuthStore.getState().auth.setUser({ id: 7, username: 'buyer', role: 1 })
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true, data: 5000000 } })
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: { id: 7, quota: 7500000 } },
    })
    const user = userEvent.setup()
    renderRedeem(`  ${CODE.toUpperCase()} `)

    expect(await screen.findByText(/account buyer/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Activate' }))

    expect(await screen.findByText('Activated')).toBeVisible()
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/api/user/topup', { key: CODE })
    expect(screen.getByRole('status')).toHaveTextContent('$10 has been added')
    expect(screen.getByRole('status')).toHaveTextContent('Current balance: $15')
    expect(
      screen.getByRole('button', { name: 'Create API Key' })
    ).toHaveAttribute('href', '/keys')
  })

  it('keeps the form when the server rejects the code', async () => {
    useAuthStore.getState().auth.setUser({ id: 7, username: 'buyer', role: 1 })
    vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: false,
        message: 'Redemption failed, please try again later',
      },
    })
    const user = userEvent.setup()
    renderRedeem(CODE)

    await user.click(await screen.findByRole('button', { name: 'Activate' }))

    expect(await screen.findByLabelText('Card code')).toHaveValue(CODE)
    expect(screen.queryByText('Activated')).toBeNull()
  })

  it('builds a bare return path when there is no code yet', () => {
    expect(redeemReturnPath('')).toBe('/redeem')
    expect(redeemReturnPath(` ${CODE} `)).toBe(`/redeem?code=${CODE}`)
  })
})
