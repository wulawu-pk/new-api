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
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Pane } from '@/components/terminal/pane'
import { TERM_BUTTON } from '@/components/terminal/styles'
import { Button } from '@/components/ui/button'
import { AccessTokensCard } from '@/features/security/components/access-tokens-card'
import { AccountBindings } from '@/features/security/components/account-bindings'
import { DeleteAccountDialog } from '@/features/security/components/dialogs/delete-account-dialog'
import { LoginSessionsCard } from '@/features/security/components/login-sessions-card'
import { PrivacyCard } from '@/features/security/components/privacy-card'

import { ConsolePageHeader } from '../shell/console-shell'
import { AccountLoader } from './components/account-loader'
import { ROW_BUTTON_DANGER } from './components/account-row'

/**
 * Security & Access (/security) in the console shell. Password, two-step
 * verification and Passkey moved to the account page; the rest of the old
 * security page (linked accounts, sign-in sessions, access tokens, privacy,
 * account deletion) is shown here with its own components.
 */
export function ConsoleSecurity() {
  const { t } = useTranslation()
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <ConsolePageHeader
        title={t('Security & Access')}
        description={t(
          'Linked accounts, signed-in devices, access tokens for scripts, and account deletion. Password, two-step verification and Passkey are on the account page.'
        )}
        actions={
          <Button
            variant='outline'
            className={TERM_BUTTON}
            render={<Link to='/profile' />}
          >
            ← {t('Account')}
          </Button>
        }
      />
      <AccountLoader title={t('Security & Access')}>
        {(profile, refresh) => (
          <div className='grid grid-cols-[minmax(0,1fr)_minmax(320px,0.5fr)] items-start gap-5 max-lg:grid-cols-1 [&>*]:min-w-0'>
            <div className='flex flex-col gap-5'>
              <Pane title={<b>{t('Account Bindings')}</b>}>
                <div className='px-5 pt-6 pb-5'>
                  <AccountBindings profile={profile} onUpdate={refresh} />
                </div>
              </Pane>
              <LoginSessionsCard />
              <AccessTokensCard />
            </div>
            <div className='flex flex-col gap-5'>
              <PrivacyCard profile={profile} onUpdate={refresh} />
              <Pane title={<b>{t('Delete Account')}</b>}>
                <div className='flex flex-col items-start gap-4 px-5 pt-6 pb-5'>
                  <p className='text-t-dim m-0 text-[13.5px] leading-[1.7]'>
                    {t('Permanently delete your account and all data')}
                  </p>
                  <Button
                    type='button'
                    variant='outline'
                    className={ROW_BUTTON_DANGER}
                    onClick={() => setDeleteOpen(true)}
                  >
                    {t('Delete Account')}
                  </Button>
                </div>
              </Pane>
            </div>
            <DeleteAccountDialog
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              username={profile.username}
            />
          </div>
        )}
      </AccountLoader>
    </>
  )
}
