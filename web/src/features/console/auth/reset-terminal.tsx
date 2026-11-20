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
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { RelayCanvasRef } from '@/components/terminal/relay-canvas'
import { SpinButton } from '@/components/terminal/spin-button'
import { TERM_INPUT } from '@/components/terminal/styles'
import { TerminalAuthFrame } from '@/components/terminal/terminal-auth-frame'
import { useScrambleText } from '@/components/terminal/use-scramble'
import { Input } from '@/components/ui/input'
import { sendPasswordResetEmail } from '@/features/auth/api'
import { PASSWORD_RESET_COUNTDOWN } from '@/features/auth/constants'
import { useTurnstile } from '@/features/auth/hooks/use-turnstile'
import { useCountdown } from '@/hooks/use-countdown'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { createServerError } from '@/lib/server-error-message'

import { TermField, TurnstileRow } from './components/auth-parts'
import { useAuthMotion } from './hooks/use-auth-motion'
import { isEmail } from './lib/username'

/**
 * Forgot-password dialog: email + human check → reset mail. The server
 * answers the same way whether or not the address has an account.
 */
export function ResetTerminal() {
  const { t } = useTranslation()
  const motion = useAuthMotion()
  const relay = useRef<RelayCanvasRef>(null)
  const turnstile = useTurnstile()
  const [widgetKey, setWidgetKey] = useState(0)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const countdown = useCountdown({ initialSeconds: PASSWORD_RESET_COUNTDOWN })

  useScrambleText()

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (motion.busy || countdown.isActive) return
    if (!isEmail(email)) {
      setError(
        email.trim()
          ? t('That email looks wrong; check the @ and the domain')
          : t('Please enter your email')
      )
      motion.fail()
      document.querySelector<HTMLElement>('#auth-user')?.focus()
      return
    }
    setError(undefined)
    if (!turnstile.validateTurnstile()) return
    const token = turnstile.turnstileToken
    if (turnstile.isTurnstileEnabled) {
      turnstile.setTurnstileToken('')
      setWidgetKey((key) => key + 1)
    }
    motion.begin()
    try {
      const res = await sendPasswordResetEmail(email.trim(), token)
      await motion.settle()
      if (!res?.success) {
        motion.fail()
        handleServerError(
          createServerError(res, t('Failed to send reset email'))
        )
        return
      }
      motion.reset()
      setSentTo(email.trim())
      countdown.start()
    } catch (err: unknown) {
      motion.fail()
      handleServerError(
        AuthOperationError.from(err, t('Failed to send reset email'))
      )
    }
  }

  let label = t('Send reset email')
  if (countdown.isActive) {
    label = t('Resend ({{seconds}} s)', { seconds: countdown.secondsLeft })
  } else if (sentTo) label = t('Resend reset email')

  return (
    <TerminalAuthFrame
      title={t('peroai reset password')}
      busy={motion.busy}
      boxClassName={motion.boxClassName}
      relayRef={relay}
    >
      <p className='text-t-dim m-0 text-[13.5px] leading-[1.7]'>
        {t(
          'Enter the email you signed up with. We send a reset email; open its link to set a new password.'
        )}
      </p>
      <form noValidate onSubmit={onSubmit} className='flex flex-col gap-4'>
        <TermField id='auth-user' label={t('Email')} error={error}>
          <Input
            id='auth-user'
            type='email'
            autoComplete='email'
            placeholder='name@example.com'
            value={email}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? 'auth-user-error' : undefined}
            onChange={(event) => {
              setEmail(event.target.value)
              if (error) setError(undefined)
            }}
            className={TERM_INPUT}
          />
        </TermField>
        <TurnstileRow
          enabled={turnstile.isTurnstileEnabled}
          siteKey={turnstile.turnstileSiteKey}
          widgetKey={widgetKey}
          onVerify={turnstile.setTurnstileToken}
          onExpire={() => turnstile.setTurnstileToken('')}
        />
        {sentTo && (
          <pre
            className='text-t-fg2 m-0 font-mono text-[12.5px] leading-[1.75] whitespace-pre-wrap'
            aria-live='polite'
          >
            <span className='text-t-ok'>✓</span> {t('Reset email sent')}
            {'\n  '}
            <span className='text-t-dim'>{t('To')}</span> {sentTo}
            {'\n  '}
            <span className='text-t-dim'>
              {t(
                'Not there? Check the spam folder; you can resend in 60 seconds.'
              )}
            </span>
          </pre>
        )}
        <SpinButton
          type='submit'
          state={motion.spin}
          label={label}
          pendingLabel={t('Sending')}
          disabled={countdown.isActive}
        />
        <div className='text-t-dim flex justify-end text-[13px]'>
          <span>
            {t('Remembered it?')}{' '}
            <Link to='/sign-in' className='text-t-fg hover:text-t-pink'>
              {t('Back to sign in')}
            </Link>
          </span>
        </div>
      </form>
    </TerminalAuthFrame>
  )
}
