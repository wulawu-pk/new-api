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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PasswordInput } from '@/components/password-input'
import type { RelayCanvasRef } from '@/components/terminal/relay-canvas'
import { SpinButton } from '@/components/terminal/spin-button'
import { TERM_INPUT, TERM_PASSWORD } from '@/components/terminal/styles'
import { TerminalAuthFrame } from '@/components/terminal/terminal-auth-frame'
import { useScrambleText } from '@/components/terminal/use-scramble'
import { Input } from '@/components/ui/input'
import { login } from '@/features/auth/api'
import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import { useTurnstile } from '@/features/auth/hooks/use-turnstile'
import { UserAuthForm } from '@/features/auth/sign-in/components/user-auth-form'
import { useStatus } from '@/hooks/use-status'
import { isAuthBundle } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { createServerError } from '@/lib/server-error-message'

import {
  AuthTabs,
  PlanBox,
  TermField,
  TermLegalConsent,
  TurnstileRow,
  type AuthSearch,
} from './components/auth-parts'
import { useAuthMotion } from './hooks/use-auth-motion'
import {
  planFromSearch,
  readPendingPlan,
  savePendingPlan,
} from './lib/pending-plan'

/**
 * Sign-in dialog of the v3 console. Same request contract as the upstream
 * form (`login` → bundle or MFA challenge → `handleLoginResult`), Turnstile
 * and legal consent included; only the presentation and motion differ.
 * Passkey / OAuth / WeChat sign-in stay available through the upstream form.
 */
export function SignInTerminal(props: { search: AuthSearch }) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const motion = useAuthMotion()
  const relay = useRef<RelayCanvasRef>(null)
  const { handleLoginResult } = useAuthRedirect()
  const turnstile = useTurnstile()
  const [widgetKey, setWidgetKey] = useState(0)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(true)
  const [errors, setErrors] = useState<{
    username?: string
    password?: string
  }>({})
  const [showOthers, setShowOthers] = useState(false)
  const userRef = useRef<HTMLInputElement>(null)
  const passRef = useRef<HTMLInputElement>(null)

  useScrambleText()

  const [plan] = useState(
    () => planFromSearch(props.search) ?? readPendingPlan()
  )
  useEffect(() => {
    if (plan) savePendingPlan(plan)
  }, [plan])

  const requiresConsent = Boolean(
    status?.user_agreement_enabled || status?.privacy_policy_enabled
  )
  const passwordLoginEnabled =
    (status?.password_login_enabled ?? true) !== false
  const encrypt = status?.password_login_encryption_enabled === true
  // Mirrors the sign-up dialog: with email verification on, people sign up
  // with an email only (the username is generated and never shown), so the
  // field asks for the email. The server still matches username OR email,
  // so admins and older accounts can type a username here.
  const emailMode = Boolean(status?.email_verification)
  const hasAlternatives = Boolean(
    status?.passkey_login ||
    status?.wechat_login ||
    status?.github_oauth ||
    status?.discord_oauth ||
    status?.oidc_enabled ||
    status?.linuxdo_oauth ||
    status?.telegram_oauth ||
    (status?.custom_oauth_providers?.length ?? 0) > 0
  )
  const redirectTo = plan ? '/keys' : props.search.redirect

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (motion.busy) return
    const next: typeof errors = {}
    if (!username.trim()) {
      next.username = emailMode
        ? t('Please enter your email')
        : t('Please enter your username or email')
    }
    if (!password) next.password = t('Please enter your password')
    setErrors(next)
    if (next.username || next.password) {
      motion.fail()
      ;(next.username ? userRef : passRef).current?.focus()
      return
    }
    if (requiresConsent && !agreed) {
      motion.fail()
      handleServerError(new Error(t('Please agree to the legal terms first')))
      return
    }
    if (!turnstile.validateTurnstile()) return

    const token = turnstile.turnstileToken
    if (turnstile.isTurnstileEnabled) {
      turnstile.setTurnstileToken('')
      setWidgetKey((key) => key + 1)
    }
    motion.begin()
    relay.current?.burst()
    try {
      const res = await login({
        username: username.trim(),
        password,
        turnstile: token,
        passwordEncryptionEnabled: encrypt,
      })
      await motion.settle()
      if (!res.success) {
        motion.fail()
        handleServerError(createServerError(res, t('Login failed')))
        return
      }
      setPassword('')
      if (isAuthBundle(res.data)) await motion.succeed()
      else motion.reset()
      await handleLoginResult(res.data, redirectTo)
    } catch (error: unknown) {
      motion.fail()
      handleServerError(AuthOperationError.from(error, t('Login failed')))
    }
  }

  return (
    <TerminalAuthFrame
      title={t('peroai sign in')}
      busy={motion.busy}
      boxClassName={motion.boxClassName}
      relayRef={relay}
    >
      <AuthTabs mode='in' search={props.search} />
      <p className='text-t-dim m-0 text-[13.5px] leading-[1.7]'>
        {t('Sign in to manage keys, check usage and top up.')}
      </p>
      {plan && <PlanBox plan={plan} mode='in' />}

      {showOthers ? (
        <div className='[&_button]:rounded-full'>
          <UserAuthForm redirectTo={redirectTo} />
          <button
            type='button'
            className='text-t-dim hover:text-t-fg mt-3 text-[13px]'
            onClick={() => setShowOthers(false)}
          >
            {t('Back to password sign-in')}
          </button>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className='flex flex-col gap-4'>
          {passwordLoginEnabled && (
            <>
              <TermField
                id='auth-user'
                label={emailMode ? t('Email') : t('Username or email')}
                error={errors.username}
              >
                <Input
                  id='auth-user'
                  ref={userRef}
                  autoComplete='username'
                  inputMode={emailMode ? 'email' : undefined}
                  placeholder='name@example.com'
                  value={username}
                  aria-invalid={Boolean(errors.username) || undefined}
                  aria-describedby={
                    errors.username ? 'auth-user-error' : undefined
                  }
                  onChange={(event) => {
                    setUsername(event.target.value)
                    if (errors.username) {
                      setErrors((e) => ({ ...e, username: undefined }))
                    }
                  }}
                  className={TERM_INPUT}
                />
              </TermField>
              <TermField
                id='auth-pass'
                label={t('Password')}
                error={errors.password}
              >
                <PasswordInput
                  id='auth-pass'
                  ref={passRef}
                  autoComplete='current-password'
                  value={password}
                  aria-invalid={Boolean(errors.password) || undefined}
                  aria-describedby={
                    errors.password ? 'auth-pass-error' : undefined
                  }
                  onChange={(event) => {
                    setPassword(event.target.value)
                    if (errors.password) {
                      setErrors((e) => ({ ...e, password: undefined }))
                    }
                  }}
                  className={TERM_PASSWORD}
                />
              </TermField>
              <TurnstileRow
                enabled={turnstile.isTurnstileEnabled}
                siteKey={turnstile.turnstileSiteKey}
                widgetKey={widgetKey}
                onVerify={turnstile.setTurnstileToken}
                onExpire={() => turnstile.setTurnstileToken('')}
              />
            </>
          )}
          <TermLegalConsent
            status={status ?? null}
            checked={agreed}
            onCheckedChange={setAgreed}
          />
          {passwordLoginEnabled && (
            <SpinButton
              type='submit'
              state={motion.spin}
              label={t('Sign in')}
              pendingLabel={t('Signing in')}
              doneLabel={t('Signed in successfully')}
            />
          )}
          {hasAlternatives && (
            <button
              type='button'
              className='text-t-dim hover:text-t-fg text-left text-[13px]'
              onClick={() => setShowOthers(true)}
            >
              {t('Other ways to sign in (Passkey, third-party accounts)')}
            </button>
          )}
          <div className='text-t-dim flex justify-between text-[13px]'>
            <Link
              to='/forgot-password'
              data-scramble=''
              className='text-t-fg hover:text-t-pink'
            >
              {t('Forgot password')}
            </Link>
            <span>
              {t('No account yet?')}{' '}
              <Link
                to='/sign-up'
                search={props.search}
                className='text-t-fg hover:text-t-pink'
              >
                {t('Sign up')}
              </Link>
            </span>
          </div>
        </form>
      )}
    </TerminalAuthFrame>
  )
}
