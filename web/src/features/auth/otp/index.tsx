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

import { AuthLayout } from '../auth-layout'
import { AuthHeading } from '../components/auth-heading'
import { AUTH_LINK_CLASS } from '../constants'
import { OtpForm } from './components/otp-form'

export function Otp() {
  const { t } = useTranslation()
  return (
    <AuthLayout>
      <div className='w-full space-y-8'>
        <AuthHeading
          command='auth verify --2fa'
          title={t('Security verification')}
          description={
            <>
              {t('Verify your identity to finish signing in.')}
              <span className='mt-2 block'>
                {t('Session expired?')}{' '}
                <Link to='/sign-in' className={AUTH_LINK_CLASS}>
                  {t('Re-login')}
                </Link>
              </span>
            </>
          }
        />

        <OtpForm />
      </div>
    </AuthLayout>
  )
}
