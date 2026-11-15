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
import { CheckCircle2, Gift, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRedemption } from '@/features/wallet/hooks/use-redemption'
import { extractRedemptionCode } from '@/features/wallet/lib/redemption-code'
import { getSelf } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

type RedeemProps = {
  initialCode?: string
}

type RedeemResult = {
  added: number
  balance: number | null
}

/** Where sign-in and sign-up send the visitor back to, code included. */
export function redeemReturnPath(code: string): string {
  const extracted = extractRedemptionCode(code)
  return extracted ? `/redeem?code=${encodeURIComponent(extracted)}` : '/redeem'
}

export function Redeem({ initialCode = '' }: RedeemProps) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const [code, setCode] = useState(initialCode)
  const [result, setResult] = useState<RedeemResult | null>(null)
  const { redeeming, redeemCode } = useRedemption()

  const handleActivate = async () => {
    const added = await redeemCode(code)
    if (!added) return
    let balance: number | null = null
    try {
      const self = await getSelf()
      if (self?.success && typeof self.data?.quota === 'number') {
        balance = self.data.quota
      }
    } catch {
      // The credit already landed; a failed balance refresh is cosmetic.
    }
    setCode('')
    setResult({ added, balance })
  }

  const returnPath = redeemReturnPath(code)

  let body
  if (result) {
    body = (
      <div className='space-y-5' role='status'>
        <div className='flex items-center gap-3'>
          <CheckCircle2 className='text-primary size-6 shrink-0' />
          <div className='space-y-1'>
            <h2 className='text-lg font-semibold'>{t('Activated')}</h2>
            <p className='text-muted-foreground text-sm'>
              {t('{{quota}} has been added to your account.', {
                quota: formatQuota(result.added),
              })}
            </p>
            {result.balance !== null && (
              <p className='text-muted-foreground text-sm'>
                {t('Current balance: {{balance}}', {
                  balance: formatQuota(result.balance),
                })}
              </p>
            )}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button render={<Link to='/keys' />}>{t('Create API Key')}</Button>
          <Button variant='outline' render={<Link to='/wallet' />}>
            {t('Go to wallet')}
          </Button>
          <Button variant='ghost' onClick={() => setResult(null)}>
            {t('Activate another card')}
          </Button>
        </div>
      </div>
    )
  } else {
    body = (
      <form
        className='space-y-4'
        onSubmit={(event) => {
          event.preventDefault()
          if (user) void handleActivate()
        }}
      >
        <div className='space-y-2'>
          <Label htmlFor='redeem-code'>{t('Card code')}</Label>
          <Input
            id='redeem-code'
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={t('Paste your 32-character card code')}
            autoComplete='off'
            spellCheck={false}
            className='h-10 font-mono'
          />
        </div>

        {user ? (
          <div className='space-y-3'>
            <p className='text-muted-foreground text-sm'>
              {t('The balance goes to account {{username}}.', {
                username: user.username,
              })}
            </p>
            <Button
              type='submit'
              className='w-full'
              disabled={redeeming || code.trim() === ''}
            >
              {redeeming && <Loader2 className='mr-2 size-4 animate-spin' />}
              {t('Activate')}
            </Button>
          </div>
        ) : (
          <div className='space-y-3'>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Sign in to activate. The balance goes to the account you sign in with.'
              )}
            </p>
            <Button
              className='w-full'
              render={<Link to='/sign-in' search={{ redirect: returnPath }} />}
            >
              {t('Sign in')}
            </Button>
            <p className='text-muted-foreground text-center text-sm'>
              {t("Don't have an account?")}{' '}
              <Link
                to='/sign-up'
                search={{ redirect: returnPath }}
                className='hover:text-primary font-medium underline underline-offset-4'
              >
                {t('Sign up')}
              </Link>
            </p>
          </div>
        )}
      </form>
    )
  }

  return (
    <PublicLayout>
      <div className='mx-auto w-full max-w-md space-y-6 py-10 sm:py-16'>
        <header className='space-y-2'>
          <div className='flex items-center gap-2'>
            <Gift className='text-primary size-5' />
            <h1 className='text-2xl font-semibold tracking-tight'>
              {t('Activate recharge card')}
            </h1>
          </div>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Enter the card code you bought to add its balance to your account.'
            )}
          </p>
        </header>

        <div className='bg-card rounded-xl border p-5'>{body}</div>

        <p className='text-muted-foreground text-xs'>
          {t(
            'Each card can be activated once. A card is not an API key and cannot call models.'
          )}
        </p>
      </div>
    </PublicLayout>
  )
}
