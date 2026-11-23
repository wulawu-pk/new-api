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
import { SignUpTerminal } from '../sign-up-terminal'

vi.mock('@/features/auth/api', () => ({
  login: vi.fn(),
  register: vi.fn(),
  sendEmailVerification: vi.fn(),
}))

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

function stubReducedMotion() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('reduce'),
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

async function signUp(search: Record<string, string>) {
  stubReducedMotion()
  vi.mocked(authApi.register).mockResolvedValue({ success: true } as never)
  vi.mocked(authApi.login).mockResolvedValue({
    success: true,
    data: BUNDLE,
  } as never)
  const user = userEvent.setup()
  const view = renderConsole(<SignUpTerminal search={search} />, '/sign-up')
  await user.type(await screen.findByLabelText('Username'), 'demo')
  await user.type(screen.getByLabelText('Password'), 'secret-pass')
  await user.click(screen.getByRole('button', { name: 'Sign up' }))
  return view
}

describe('terminal sign-up: where it lands', () => {
  it('opens the dashboard when the link carried no redirect', async () => {
    const { router } = await signUp({})

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard')
    )
    expect(authApi.register).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'demo', password: 'secret-pass' })
    )
    expect(authApi.login).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'demo', password: 'secret-pass' })
    )
  })

  it('goes to the given in-site redirect', async () => {
    const { router } = await signUp({ redirect: '/wallet' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet'))
  })

  it('ignores an off-site redirect and opens the dashboard', async () => {
    const { router } = await signUp({ redirect: 'https://evil.example/x' })

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard')
    )
  })

  it('opens the key list when the landing page picked a plan', async () => {
    const { router } = await signUp({ plan: 'gpt-pro', redirect: '/wallet' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/keys'))
  })
})
