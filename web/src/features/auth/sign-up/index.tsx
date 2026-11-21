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
import { Link, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'

import { AuthLayout } from '../auth-layout'
import { AuthHeading } from '../components/auth-heading'
import { TermsFooter } from '../components/terms-footer'
import { AUTH_LINK_CLASS } from '../constants'
import { SignUpForm } from './components/sign-up-form'

export function SignUp() {
  const { t } = useTranslation()
  const { redirect } = useSearch({ from: '/(auth)/sign-up' })
  const { status } = useStatus()

  return (
    <AuthLayout>
      <div className='w-full space-y-8'>
        <AuthHeading
          command='auth register'
          title={t('Create an account')}
          description={
            <>
              {t('Already have an account?')}{' '}
              <Link
                to='/sign-in'
                search={{ redirect }}
                className={AUTH_LINK_CLASS}
              >
                {t('Sign in')}
              </Link>
            </>
          }
        />

        <SignUpForm redirectTo={redirect} />

        <TermsFooter variant='sign-up' status={status} />
      </div>
    </AuthLayout>
  )
}
