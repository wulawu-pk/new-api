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
import { useTranslation } from 'react-i18next'

import { TERM_BUTTON } from '@/components/terminal/styles'
import { Button } from '@/components/ui/button'

import { ConsolePageHeader } from '../shell/console-shell'
import { AccountLoader } from './components/account-loader'
import { LanguagePane } from './components/language-pane'
import { NotifyPane } from './components/notify-pane'
import { ProfilePane } from './components/profile-pane'
import { VerificationPane } from './components/verification-pane'

/**
 * Account page (/profile) in the console shell: who you are and how you
 * sign in, second factors, notifications and language. Sessions, access
 * tokens, linked accounts, privacy and account deletion are on
 * Security & Access (/security).
 */
export function ConsoleAccount() {
  const { t } = useTranslation()
  return (
    <>
      <ConsolePageHeader
        title={t('Account')}
        description={t(
          'Sign-in, notifications and language. Sign-in sessions, access tokens and linked accounts are under Security & Access.'
        )}
        actions={
          <Button
            variant='outline'
            className={TERM_BUTTON}
            render={<Link to='/security' />}
          >
            {t('Security & Access')} →
          </Button>
        }
      />
      <AccountLoader title={t('Account')}>
        {(profile, refresh) => (
          <div className='grid grid-cols-2 items-start gap-5 max-md:grid-cols-1 [&>*]:min-w-0'>
            <div className='flex flex-col gap-5'>
              <ProfilePane profile={profile} onUpdate={refresh} />
              <VerificationPane />
              <LanguagePane profile={profile} onUpdate={refresh} />
            </div>
            <NotifyPane profile={profile} onUpdate={refresh} />
          </div>
        )}
      </AccountLoader>
    </>
  )
}
