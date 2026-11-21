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
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserProfile } from '@/features/profile/types'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { ConsoleAccount } from '..'
import { renderConsole } from '../../__tests__/render-console'

const PROFILE: UserProfile = {
  id: 7,
  username: 'alice',
  display_name: 'alice',
  role: 1,
  group: 'default',
  quota: 0,
  used_quota: 0,
  request_count: 0,
  status: 1,
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  created_time: 0,
  has_password: true,
  setting: JSON.stringify({ notify_type: 'email' }),
}

let selfResponse: { success: boolean; message?: string; data?: UserProfile }

beforeEach(() => {
  selfResponse = { success: true, data: PROFILE }
  useAuthStore.getState().auth.setUser({ ...PROFILE })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/self') return { data: selfResponse }
    if (url === '/api/status') {
      return {
        data: {
          success: true,
          data: { quota_remind_enabled: true, quota_remind_threshold: 500000 },
        },
      }
    }
    if (url === '/api/user/passkey') {
      return { data: { success: true, data: { enabled: false } } }
    }
    if (url === '/api/user/2fa/status') {
      return {
        data: {
          success: true,
          data: { enabled: true, locked: false, backup_codes_remaining: 4 },
        },
      }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
})

afterEach(() => {
  cleanup()
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
})

describe('console account page', () => {
  it('a user without an email sees the email as not bound with a bind action', async () => {
    renderConsole(<ConsoleAccount />, '/profile')

    const email = (
      await screen.findByText('Email', { selector: 'dt' })
    ).closest('div') as HTMLElement
    expect(within(email).getByText('Not bound')).toBeInTheDocument()
    expect(
      within(email).getByRole('button', { name: 'Bind' })
    ).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('second factors show their own status: 2FA on with backup codes left, Passkey off', async () => {
    renderConsole(<ConsoleAccount />, '/profile')

    const twoFA = (await screen.findByText('Two-step verification')).closest(
      'div'
    ) as HTMLElement
    expect(
      await within(twoFA).findByText('Backup codes remaining: 4')
    ).toBeInTheDocument()
    expect(
      within(twoFA).getByRole('button', { name: 'Turn off' })
    ).toBeInTheDocument()

    const passkey = screen.getByText('Passkey').closest('div') as HTMLElement
    expect(await within(passkey).findByText('Not enabled')).toBeInTheDocument()
  })

  it('switching the method to webhook and saving sends the webhook settings', async () => {
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    const user = userEvent.setup()
    renderConsole(<ConsoleAccount />, '/profile')

    await user.selectOptions(
      await screen.findByLabelText('Notification Method'),
      'webhook'
    )
    await user.type(
      screen.getByLabelText('Webhook URL'),
      'https://example.com/hook'
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        '/api/user/setting',
        expect.objectContaining({
          notify_type: 'webhook',
          webhook_url: 'https://example.com/hook',
        })
      )
    )
  })

  it('the password row opens the change-password dialog', async () => {
    const user = userEvent.setup()
    renderConsole(<ConsoleAccount />, '/profile')

    await user.click(
      await screen.findByRole('button', { name: 'Change Password' })
    )

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('a failed user read names the endpoint and offers a retry instead of the settings', async () => {
    selfResponse = { success: false, message: 'boom' }
    renderConsole(<ConsoleAccount />, '/profile')

    expect(await screen.findByText('/api/user/self')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Notification Method')).toBeNull()
  })
})
