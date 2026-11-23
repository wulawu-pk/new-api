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
  useLocation,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { extractRedemptionCode } from '@/features/wallet/lib/redemption-code'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { Redeem, RedeemFromUrl } from '..'
import {
  PENDING_REDEEM_CODE_KEY,
  PENDING_REDEEM_CODE_TTL_MS,
  clearPendingRedeemCode,
  purgeExpiredPendingRedeemCode,
  readPendingRedeemCode,
  redeemCodeFromLocation,
  savePendingRedeemCode,
} from '../lib/pending-code'

// The public header needs status, notifications and a full route tree; the
// page body is what this suite covers.
vi.mock('@/components/layout', () => ({
  PublicLayout: (props: { children?: unknown }) => props.children,
}))

const CODE = '0123456789abcdef0123456789abcdef'

function renderRedeem(initialCode?: string, initialEntry = '/redeem') {
  const root = createRootRoute({ component: Outlet })
  const page = createRoute({
    getParentRoute: () => root,
    path: '/redeem',
    validateSearch: (search: Record<string, unknown>) => ({
      code: typeof search.code === 'string' ? search.code : undefined,
    }),
    component: function Page() {
      const { code } = page.useSearch()
      const hash = useLocation({ select: (location) => location.hash })
      return initialCode === undefined ? (
        <RedeemFromUrl searchCode={code} hash={hash} />
      ) : (
        <Redeem initialCode={initialCode} />
      )
    },
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
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  sessionStorage.clear()
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

  it('returns nothing for text without a code, so it is never passed on', () => {
    expect(extractRedemptionCode(' abc ')).toBe('')
    expect(extractRedemptionCode(`${CODE}0`)).toBe('')
    expect(extractRedemptionCode('my email is a@b.c')).toBe('')
    expect(extractRedemptionCode('')).toBe('')
  })
})

describe('redeem page', () => {
  it('sends a signed-out visitor to sign in without the code in any URL', async () => {
    const post = vi.spyOn(api, 'post')
    const user = userEvent.setup()
    const router = renderRedeem(CODE)

    const signIn = await screen.findByRole('button', { name: 'Sign in' })
    expect(signIn).toHaveAttribute(
      'href',
      `/sign-in?redirect=${encodeURIComponent('/redeem')}`
    )
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
      'href',
      `/sign-up?redirect=${encodeURIComponent('/redeem')}`
    )
    expect(screen.queryByRole('button', { name: 'Activate' })).toBeNull()

    await user.click(signIn)
    expect(await screen.findByText('/sign-in page')).toBeVisible()
    expect(router.state.location.href).not.toContain(CODE)
    expect(sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)).toContain(CODE)
    expect(post).not.toHaveBeenCalled()
  })

  it('restores the pending code after sign-in and forgets it', async () => {
    useAuthStore.getState().auth.setUser({ id: 7, username: 'buyer', role: 1 })
    sessionStorage.setItem(
      PENDING_REDEEM_CODE_KEY,
      JSON.stringify({ code: CODE, at: Date.now() })
    )
    renderRedeem()

    expect(await screen.findByLabelText('Card code')).toHaveValue(CODE)
    expect(sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)).toBeNull()
  })

  it('ignores a pending code older than 10 minutes and removes it', () => {
    sessionStorage.setItem(
      PENDING_REDEEM_CODE_KEY,
      JSON.stringify({ code: CODE, at: Date.now() - 11 * 60 * 1000 })
    )
    expect(readPendingRedeemCode()).toBe('')
    expect(sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)).toBeNull()
  })

  it('keeps a pending code until the TTL and drops it exactly at the TTL', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      savePendingRedeemCode(CODE)
      vi.setSystemTime(1_000_000 + PENDING_REDEEM_CODE_TTL_MS - 1)
      expect(readPendingRedeemCode()).toBe(CODE)
      // Reading alone does not remove a valid code; the page clears it.
      expect(sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)).toContain(CODE)
      vi.setSystemTime(1_000_000 + PENDING_REDEEM_CODE_TTL_MS)
      expect(readPendingRedeemCode()).toBe('')
      expect(sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('removes a pending code saved in the future or not readable', () => {
    sessionStorage.setItem(
      PENDING_REDEEM_CODE_KEY,
      JSON.stringify({ code: CODE, at: Date.now() + 60_000 })
    )
    expect(readPendingRedeemCode()).toBe('')
    expect(sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)).toBeNull()

    sessionStorage.setItem(PENDING_REDEEM_CODE_KEY, '{not json')
    expect(readPendingRedeemCode()).toBe('')
    expect(sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)).toBeNull()
  })

  it('offers the restored code only once (a second visit starts empty)', async () => {
    useAuthStore.getState().auth.setUser({ id: 7, username: 'buyer', role: 1 })
    savePendingRedeemCode(CODE)
    renderRedeem()
    expect(await screen.findByLabelText('Card code')).toHaveValue(CODE)
    cleanup()

    renderRedeem()
    expect(await screen.findByLabelText('Card code')).toHaveValue('')
  })

  it('reads a legacy ?code= link and clears it from the address bar', async () => {
    const router = renderRedeem(undefined, `/redeem?code=${CODE}`)

    expect(await screen.findByLabelText('Card code')).toHaveValue(CODE)
    await vi.waitFor(() => expect(router.state.location.href).toBe('/redeem'))
    expect(screen.getByLabelText('Card code')).toHaveValue(CODE)
  })

  it('reads the code from a #code= fragment', () => {
    expect(redeemCodeFromLocation(undefined, `#code=${CODE}`)).toBe(CODE)
    expect(redeemCodeFromLocation(undefined, `code=${CODE}`)).toBe(CODE)
    expect(redeemCodeFromLocation(CODE, '')).toBe(CODE)
    expect(redeemCodeFromLocation(undefined, '')).toBe('')
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

  it('forgets the pending code once the card is activated', async () => {
    useAuthStore.getState().auth.setUser({ id: 7, username: 'buyer', role: 1 })
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: 5000000 },
    })
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: { id: 7, quota: 5000000 } },
    })
    const user = userEvent.setup()
    renderRedeem(CODE)
    sessionStorage.setItem(
      PENDING_REDEEM_CODE_KEY,
      JSON.stringify({ code: CODE, at: Date.now() })
    )

    await user.click(await screen.findByRole('button', { name: 'Activate' }))
    expect(await screen.findByText('Activated')).toBeVisible()
    expect(sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)).toBeNull()
  })

  it('does not send text without a code to the server', async () => {
    useAuthStore.getState().auth.setUser({ id: 7, username: 'buyer', role: 1 })
    const post = vi.spyOn(api, 'post')
    const user = userEvent.setup()
    renderRedeem('not a card code')

    await user.click(await screen.findByRole('button', { name: 'Activate' }))
    expect(post).not.toHaveBeenCalled()
  })

  it('shows the activation when the balance cannot be read afterwards', async () => {
    useAuthStore.getState().auth.setUser({ id: 7, username: 'buyer', role: 1 })
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: 5000000 },
    })
    vi.spyOn(api, 'get').mockRejectedValue(new Error('network down'))
    const error = vi.spyOn(toast, 'error').mockImplementation(() => 0)
    const info = vi.spyOn(toast, 'info').mockImplementation(() => 0)
    const user = userEvent.setup()
    renderRedeem(CODE)
    sessionStorage.setItem(
      PENDING_REDEEM_CODE_KEY,
      JSON.stringify({ code: CODE, at: Date.now() })
    )

    await user.click(await screen.findByRole('button', { name: 'Activate' }))

    expect(await screen.findByText('Activated')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('$10 has been added')
    expect(screen.getByRole('status')).not.toHaveTextContent('Current balance')
    await vi.waitFor(() =>
      expect(info).toHaveBeenCalledWith('Your balance will update shortly.')
    )
    expect(error).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)).toBeNull()
  })
})

describe('pending code expiry', () => {
  it('removes a saved code at the TTL even when nothing reads it', () => {
    vi.useFakeTimers()
    try {
      savePendingRedeemCode(CODE)
      vi.advanceTimersByTime(PENDING_REDEEM_CODE_TTL_MS - 1)
      expect(sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)).toContain(CODE)
      vi.advanceTimersByTime(1)
      expect(sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)).toBeNull()
    } finally {
      clearPendingRedeemCode()
      vi.useRealTimers()
    }
  })

  it('on start removes an expired code and schedules removal of a live one', () => {
    vi.useFakeTimers()
    try {
      sessionStorage.setItem(
        PENDING_REDEEM_CODE_KEY,
        JSON.stringify({
          code: CODE,
          at: Date.now() - PENDING_REDEEM_CODE_TTL_MS,
        })
      )
      purgeExpiredPendingRedeemCode()
      expect(sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)).toBeNull()

      sessionStorage.setItem(
        PENDING_REDEEM_CODE_KEY,
        JSON.stringify({ code: CODE, at: Date.now() - 60_000 })
      )
      purgeExpiredPendingRedeemCode()
      expect(sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)).toContain(CODE)
      vi.advanceTimersByTime(PENDING_REDEEM_CODE_TTL_MS - 60_000)
      expect(sessionStorage.getItem(PENDING_REDEEM_CODE_KEY)).toBeNull()
    } finally {
      clearPendingRedeemCode()
      vi.useRealTimers()
    }
  })
})
