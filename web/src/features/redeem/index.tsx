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
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Pane } from '@/components/terminal/pane'
import { SpinButton } from '@/components/terminal/spin-button'
import {
  TERM_BUTTON,
  TERM_BUTTON_GHOST,
  TERM_BUTTON_PRIMARY,
  TERM_INPUT,
} from '@/components/terminal/styles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  refreshBalanceOrNotify,
  useRedemption,
} from '@/features/wallet/hooks/use-redemption'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { ConsolePageHeader } from '../console/shell/console-shell'
import {
  REDEEM_RETURN_PATH,
  clearPendingRedeemCode,
  readPendingRedeemCode,
  redeemCodeFromLocation,
  savePendingRedeemCode,
} from './lib/pending-code'

type RedeemProps = {
  initialCode?: string
}

type RedeemResult = {
  added: number
  balance: number | null
}

/**
 * The /redeem route: takes the code out of the address bar, then replaces
 * the address with a bare /redeem so the code does not stay in history,
 * bookmarks or sign-in links.
 */
export function RedeemFromUrl({
  searchCode,
  hash,
}: {
  searchCode?: string
  hash: string
}) {
  const navigate = useNavigate()
  const [initialCode] = useState(() => redeemCodeFromLocation(searchCode, hash))
  const hasCodeInUrl = searchCode !== undefined || /(^|[#&])code=/.test(hash)
  useEffect(() => {
    if (hasCodeInUrl) {
      void navigate({ to: REDEEM_RETURN_PATH, search: {}, replace: true })
    }
  }, [hasCodeInUrl, navigate])
  return <Redeem initialCode={initialCode} />
}

export function Redeem({ initialCode = '' }: RedeemProps) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const [code, setCode] = useState(() => initialCode || readPendingRedeemCode())
  const [result, setResult] = useState<RedeemResult | null>(null)
  const { redeeming, redeemCode } = useRedemption()
  // Only the latest activation may write its balance into the success view:
  // a slow balance read of an earlier card must not show on the next one.
  const balanceRead = useRef<AbortController | null>(null)
  const activation = useRef(0)

  // The pending code has been read into the form; drop the stored copy.
  useEffect(() => {
    clearPendingRedeemCode()
    return () => balanceRead.current?.abort()
  }, [])

  const cancelBalanceRead = () => {
    activation.current += 1
    balanceRead.current?.abort()
    balanceRead.current = null
  }

  const handleActivate = async () => {
    cancelBalanceRead()
    const seq = activation.current
    const added = await redeemCode(code, { refreshBalance: false })
    if (!added || seq !== activation.current) return
    // The card is activated: clear the code and show the success first.
    setCode('')
    clearPendingRedeemCode()
    setResult({ added, balance: null })
    // A failed balance read only shows a notice; the credit already landed.
    const controller = new AbortController()
    balanceRead.current = controller
    const balance = await refreshBalanceOrNotify(controller.signal)
    if (seq !== activation.current || controller.signal.aborted) return
    balanceRead.current = null
    if (balance !== null) {
      setResult((current) => (current ? { ...current, balance } : current))
    }
  }

  const activateAnother = () => {
    cancelBalanceRead()
    setResult(null)
  }

  const keepCodeForSignIn = () => savePendingRedeemCode(code)

  let body
  if (result) {
    body = (
      <div className='flex flex-col gap-5 px-5 pt-6 pb-5' role='status'>
        <div className='flex flex-col gap-1.5'>
          <h2 className='m-0 text-base font-semibold'>
            <span className='text-t-ok' aria-hidden='true'>
              ✓
            </span>{' '}
            <span>{t('Activated')}</span>
          </h2>
          <p className='text-t-fg2 m-0 text-sm leading-[1.7]'>
            {t('{{quota}} has been added to your account.', {
              quota: formatQuota(result.added),
            })}
          </p>
          {result.balance !== null && (
            <p className='text-t-dim m-0 font-mono text-[13px]'>
              {t('Current balance: {{balance}}', {
                balance: formatQuota(result.balance),
              })}
            </p>
          )}
        </div>
        <div className='flex flex-wrap gap-2.5'>
          <Button className={TERM_BUTTON_PRIMARY} render={<Link to='/keys' />}>
            {t('Create API Key')}
          </Button>
          <Button
            variant='outline'
            className={TERM_BUTTON}
            render={<Link to='/wallet' />}
          >
            {t('Go to wallet')}
          </Button>
          <Button
            variant='ghost'
            className={TERM_BUTTON_GHOST}
            onClick={activateAnother}
          >
            {t('Activate another card')}
          </Button>
        </div>
      </div>
    )
  } else {
    body = (
      <form
        noValidate
        className='flex flex-col gap-4 px-5 pt-6 pb-5'
        onSubmit={(event) => {
          event.preventDefault()
          if (user && !redeeming) void handleActivate()
        }}
      >
        <div className='flex flex-col gap-[7px]'>
          <Label
            htmlFor='redeem-code'
            className='text-t-fg2 text-[13px] font-normal'
          >
            {t('Card code')}
          </Label>
          <Input
            id='redeem-code'
            value={code}
            onChange={(event) => {
              setCode(event.target.value)
              if (event.target.value.trim() === '') clearPendingRedeemCode()
            }}
            placeholder={t('Paste your 32-character card code')}
            autoComplete='off'
            spellCheck={false}
            className={cn(TERM_INPUT, 'font-mono')}
          />
        </div>

        {user ? (
          <div className='flex flex-col gap-3'>
            <p className='text-t-dim m-0 text-[13.5px] leading-[1.7]'>
              {t('The balance goes to account {{username}}.', {
                username: user.username,
              })}
            </p>
            <SpinButton
              type='submit'
              state={redeeming ? 'pending' : 'idle'}
              label={t('Activate')}
              pendingLabel={t('Redeeming…')}
              disabled={!redeeming && code.trim() === ''}
            />
          </div>
        ) : (
          <div className='flex flex-col gap-3'>
            <p className='text-t-dim m-0 text-[13.5px] leading-[1.7]'>
              {t(
                'Sign in to activate. The balance goes to the account you sign in with.'
              )}
            </p>
            <Button
              className={cn(TERM_BUTTON_PRIMARY, 'w-full py-3')}
              render={
                <Link
                  to='/sign-in'
                  search={{ redirect: REDEEM_RETURN_PATH }}
                  onClick={keepCodeForSignIn}
                />
              }
            >
              {t('Sign in')}
            </Button>
            <p className='text-t-dim m-0 text-center text-[13px]'>
              {t("Don't have an account?")}{' '}
              <Link
                to='/sign-up'
                search={{ redirect: REDEEM_RETURN_PATH }}
                onClick={keepCodeForSignIn}
                className='text-t-fg hover:text-t-accent'
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
    <div className='mx-auto flex w-full max-w-[560px] flex-col gap-6 pt-6'>
      <ConsolePageHeader
        title={t('Activate recharge card')}
        description={t(
          'Enter the card code you bought to add its balance to your account.'
        )}
      />

      <Pane
        hero
        title={
          <>
            <b>redeem</b>
            {'　'}
            {t('Card code')}
          </>
        }
      >
        {body}
      </Pane>

      <p className='text-t-dim m-0 text-[12.5px] leading-[1.7]'>
        {t(
          'Each card can be activated once. A card is not an API key and cannot call models.'
        )}
      </p>
    </div>
  )
}
