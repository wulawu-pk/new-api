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
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '@/features/auth/api'
import { useAuthStore, type AuthBundle } from '@/stores/auth-store'

import { renderConsole } from '../../__tests__/render-console'
import { readPendingPlan } from '../lib/pending-plan'
import { SignInTerminal } from '../sign-in-terminal'

vi.mock('@/features/auth/api', () => ({ login: vi.fn() }))

// The relay background needs a real canvas; jsdom has none.
vi.mock('@/components/terminal/relay-canvas', () => ({
  RelayCanvas: () => null,
}))

const BUNDLE: AuthBundle = {
  access_token: 'access-token',
  token_type: 'Bearer',
  access_expires_at: Math.floor(Date.now() / 1000) + 600,
  user: { id: 42, username: 'demo', role: 1 },
  session: {
    sid: 'session-a',
    current: true,
    login_method: 'password',
    ip: '127.0.0.1',
    user_agent: 'test',
    created_at: 100,
    last_active_at: 100,
    expires_at: 1000,
  },
}

function stubMatchMedia(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduce && query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  sessionStorage.clear()
  useAuthStore.getState().auth.reset('idle')
})

describe('terminal sign-in', () => {
  it('flags both empty fields and does not send a request', async () => {
    stubMatchMedia(true)
    const user = userEvent.setup()
    renderConsole(<SignInTerminal search={{}} />, '/sign-in')

    await user.click(await screen.findByRole('button', { name: 'Sign in' }))

    expect(screen.getByLabelText('Username or email')).toHaveAttribute(
      'aria-invalid',
      'true'
    )
    expect(
      screen.getByText('Please enter your username or email')
    ).toBeInTheDocument()
    expect(screen.getByText('Please enter your password')).toBeInTheDocument()
    expect(authApi.login).not.toHaveBeenCalled()
  })

  it('signs in with the trimmed username and opens the console', async () => {
    stubMatchMedia(true)
    vi.mocked(authApi.login).mockResolvedValue({
      success: true,
      data: BUNDLE,
    } as never)
    const user = userEvent.setup()
    const { router } = renderConsole(<SignInTerminal search={{}} />, '/sign-in')

    await user.type(
      await screen.findByLabelText('Username or email'),
      '  demo '
    )
    await user.type(screen.getByLabelText('Password'), 'secret-pass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard')
    )
    expect(authApi.login).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'demo', password: 'secret-pass' })
    )
  })

  it('stays on the dialog and re-enables the button when the server refuses', async () => {
    stubMatchMedia(true)
    vi.mocked(authApi.login).mockResolvedValue({
      success: false,
      message: 'wrong password',
    } as never)
    const user = userEvent.setup()
    const { router } = renderConsole(<SignInTerminal search={{}} />, '/sign-in')

    await user.type(await screen.findByLabelText('Username or email'), 'demo')
    await user.type(screen.getByLabelText('Password'), 'bad-pass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sign in' })
      ).not.toHaveAttribute('aria-busy')
    )
    expect(router.state.location.pathname).toBe('/sign-in')
  })

  it('shows the configuration picked on the landing page and keeps it for the console', async () => {
    stubMatchMedia(true)
    renderConsole(
      <SignInTerminal
        search={{ plan: 'gpt-pro', model: 'gpt-6-astra', client: 'Codex' }}
      />,
      '/sign-in'
    )

    expect(await screen.findByText('gpt-6-astra')).toBeInTheDocument()
    expect(readPendingPlan()).toEqual({
      group: 'gpt-pro',
      model: 'gpt-6-astra',
      client: 'Codex',
    })
  })
})
