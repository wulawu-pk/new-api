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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance, type i18n } from 'i18next'
import { useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import type { UpdateOptionRequest } from '../../types'
import { BotProtectionSection } from '../bot-protection-section'

const defaults = {
  TurnstileCheckEnabled: false,
  TurnstileSiteKey: '',
  TurnstileSecretKey: '',
}

let testI18n: i18n

type FixtureProps = {
  values?: typeof defaults
  secretKeyConfigured?: boolean
}

function Fixture(props: FixtureProps = {}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  )

  return (
    <I18nextProvider i18n={testI18n}>
      <QueryClientProvider client={client}>
        <div ref={setContainer} />
        <SettingsPageProvider actionsContainer={container}>
          <BotProtectionSection
            defaultValues={props.values ?? defaults}
            secretKeyConfigured={props.secretKeyConfigured}
          />
        </SettingsPageProvider>
      </QueryClientProvider>
    </I18nextProvider>
  )
}

async function renderSettings(props: FixtureProps = {}) {
  const route = createRootRoute({ component: () => <Fixture {...props} /> })
  const router = createRouter({
    routeTree: route,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(<RouterProvider router={router} />)
}

beforeEach(async () => {
  testI18n = createInstance()
  await testI18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: {} }, zh },
    interpolation: { escapeValue: false },
  })
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
  // /api/status: no stored site key unless a test says otherwise.
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: {} },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const KEYS_REQUIRED =
  'Enter the Turnstile site key and secret key before turning Turnstile on.'

describe('Bot Protection settings saves', () => {
  it('saves both keys before enabling Turnstile in one save', async () => {
    const savedOptions: Record<string, string | number | boolean> = {}
    const put = vi.spyOn(api, 'put').mockImplementation(async (_url, body) => {
      const request = body as UpdateOptionRequest
      savedOptions[request.key] = request.value
      return { data: { success: true, message: '' } } as never
    })
    const user = userEvent.setup()
    await renderSettings()
    await user.type(
      screen.getByRole('textbox', { name: 'Site Key' }),
      'site-key'
    )
    await user.type(screen.getByLabelText('Secret Key'), 'secret-key')
    await user.click(screen.getByRole('switch', { name: 'Enable Turnstile' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(3))
    expect(
      put.mock.calls.map(([, body]) => (body as UpdateOptionRequest).key)
    ).toEqual([
      'TurnstileSiteKey',
      'TurnstileSecretKey',
      'TurnstileCheckEnabled',
    ])
    expect(savedOptions).toEqual({
      TurnstileSiteKey: 'site-key',
      TurnstileSecretKey: 'secret-key',
      TurnstileCheckEnabled: true,
    })
  })
})

describe('Bot Protection settings guard', () => {
  it('does not turn Turnstile on without a secret key', async () => {
    const put = vi.spyOn(api, 'put')
    const error = vi.spyOn(toast, 'error').mockImplementation(() => 0)
    const user = userEvent.setup()
    await renderSettings()
    await user.type(
      screen.getByRole('textbox', { name: 'Site Key' }),
      'site-key'
    )
    await user.click(screen.getByRole('switch', { name: 'Enable Turnstile' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(error).toHaveBeenCalledWith(KEYS_REQUIRED))
    expect(put).not.toHaveBeenCalled()
  })

  it('does not turn Turnstile on without a site key', async () => {
    const put = vi.spyOn(api, 'put')
    const error = vi.spyOn(toast, 'error').mockImplementation(() => 0)
    const user = userEvent.setup()
    await renderSettings()
    await user.type(screen.getByLabelText('Secret Key'), 'secret-key')
    await user.click(screen.getByRole('switch', { name: 'Enable Turnstile' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(error).toHaveBeenCalledWith(KEYS_REQUIRED))
    expect(put).not.toHaveBeenCalled()
  })

  it('accepts a stored secret the server reports as configured', async () => {
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true, message: '' } } as never)
    const user = userEvent.setup()
    await renderSettings({
      values: { ...defaults, TurnstileSiteKey: 'site-key' },
      secretKeyConfigured: true,
    })
    await user.click(screen.getByRole('switch', { name: 'Enable Turnstile' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0][1]).toEqual({
      key: 'TurnstileCheckEnabled',
      value: true,
    })
  })

  it('stops and shows the server message when a key is refused', async () => {
    const put = vi.spyOn(api, 'put').mockImplementation(async (_url, body) => {
      const request = body as UpdateOptionRequest
      if (request.key === 'TurnstileSecretKey') {
        return {
          data: { success: false, message: 'Secret key rejected by server' },
        } as never
      }
      return { data: { success: true, message: '' } } as never
    })
    const error = vi.spyOn(toast, 'error').mockImplementation(() => 0)
    const success = vi.spyOn(toast, 'success').mockImplementation(() => 0)
    const user = userEvent.setup()
    await renderSettings()
    await user.type(
      screen.getByRole('textbox', { name: 'Site Key' }),
      'site-key'
    )
    await user.type(screen.getByLabelText('Secret Key'), 'secret-key')
    await user.click(screen.getByRole('switch', { name: 'Enable Turnstile' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Secret key rejected by server')
    )
    // Turnstile itself is never switched on after the failed key.
    expect(
      put.mock.calls.map(([, body]) => (body as UpdateOptionRequest).key)
    ).toEqual(['TurnstileSiteKey', 'TurnstileSecretKey'])
    expect(success).toHaveBeenCalledTimes(1)
  })

  it('shows the server message when enabling itself is refused', async () => {
    vi.spyOn(api, 'put').mockImplementation(async (_url, body) => {
      const request = body as UpdateOptionRequest
      return request.key === 'TurnstileCheckEnabled'
        ? ({
            data: {
              success: false,
              message: 'Cannot enable Turnstile verification.',
            },
          } as never)
        : ({ data: { success: true, message: '' } } as never)
    })
    const error = vi.spyOn(toast, 'error').mockImplementation(() => 0)
    const user = userEvent.setup()
    await renderSettings()
    await user.type(
      screen.getByRole('textbox', { name: 'Site Key' }),
      'site-key'
    )
    await user.type(screen.getByLabelText('Secret Key'), 'secret-key')
    await user.click(screen.getByRole('switch', { name: 'Enable Turnstile' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        'Cannot enable Turnstile verification.'
      )
    )
  })
})
