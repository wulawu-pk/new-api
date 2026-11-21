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
import dayjs from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Pane } from '@/components/terminal/pane'
import { Button } from '@/components/ui/button'
import type { UserProfile } from '@/features/profile/types'
import { ChangePasswordDialog } from '@/features/security/components/dialogs/change-password-dialog'
import { EmailBindDialog } from '@/features/security/components/dialogs/email-bind-dialog'

import { AccountRow, ROW_BUTTON } from './account-row'

type ProfilePaneProps = {
  profile: UserProfile
  onUpdate: () => void
}

/**
 * Who the user is and how they sign in: username, email (bind / change),
 * password (set / change). The dialogs are the security page's own, so the
 * identity checks they run stay the same.
 */
export function ProfilePane(props: ProfilePaneProps) {
  const { t } = useTranslation()
  const [dialog, setDialog] = useState<'password' | 'email' | null>(null)
  const profile = props.profile
  const hasPassword = profile.has_password !== false

  return (
    <Pane title={<b>{t('Account')}</b>}>
      <dl className='m-0 px-5 pt-3 pb-2'>
        <AccountRow label={t('Username')}>
          <span className='font-mono'>{profile.username}</span>
        </AccountRow>
        <AccountRow
          label={t('Email')}
          note={
            profile.email
              ? undefined
              : t('Used to sign in and to get password reset links.')
          }
          actions={
            <Button
              type='button'
              variant='outline'
              className={ROW_BUTTON}
              onClick={() => setDialog('email')}
            >
              {profile.email ? t('Change') : t('Bind')}
            </Button>
          }
        >
          {profile.email ? (
            <span className='font-mono'>{profile.email}</span>
          ) : (
            <span className='text-t-dim'>{t('Not bound')}</span>
          )}
        </AccountRow>
        <AccountRow
          label={t('Password')}
          actions={
            <Button
              type='button'
              variant='outline'
              className={ROW_BUTTON}
              onClick={() => setDialog('password')}
            >
              {hasPassword ? t('Change Password') : t('Set Password')}
            </Button>
          }
        >
          {hasPassword ? (
            <span className='text-t-dim font-mono tracking-[2px]'>
              ••••••••
            </span>
          ) : (
            <span className='text-t-warn'>{t('Not set')}</span>
          )}
        </AccountRow>
        <AccountRow label={t('User ID')}>
          <span className='font-mono'>{profile.id}</span>
        </AccountRow>
        {profile.created_time > 0 && (
          <AccountRow label={t('Joined')}>
            <span className='font-mono'>
              {dayjs.unix(profile.created_time).format('YYYY-MM-DD')}
            </span>
          </AccountRow>
        )}
      </dl>

      <ChangePasswordDialog
        open={dialog === 'password'}
        onOpenChange={(open) => setDialog(open ? 'password' : null)}
        username={profile.username}
        hasPassword={profile.has_password}
        onSuccess={props.onUpdate}
      />
      <EmailBindDialog
        open={dialog === 'email'}
        onOpenChange={(open) => setDialog(open ? 'email' : null)}
        currentEmail={profile.email}
        onSuccess={props.onUpdate}
      />
    </Pane>
  )
}
