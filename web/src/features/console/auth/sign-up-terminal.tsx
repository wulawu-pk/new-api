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

import { PasswordInput } from '@/components/password-input'
import type { RelayCanvasRef } from '@/components/terminal/relay-canvas'
import { SpinButton } from '@/components/terminal/spin-button'
import {
  TERM_BUTTON,
  TERM_INPUT,
  TERM_PASSWORD,
} from '@/components/terminal/styles'
import { TerminalAuthFrame } from '@/components/terminal/terminal-auth-frame'
import { useScrambleText } from '@/components/terminal/use-scramble'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { login, register } from '@/features/auth/api'
import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import { useEmailVerification } from '@/features/auth/hooks/use-email-verification'
import { useTurnstile } from '@/features/auth/hooks/use-turnstile'
import { getAffiliateCode } from '@/features/auth/lib/storage'
import { useStatus } from '@/hooks/use-status'
import { isAuthBundle } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { accountPasswordSchema } from '@/lib/password-policy'
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
import { deriveUsername, isEmail } from './lib/username'

type Errors = { account?: string; password?: string; code?: string }

const USERNAME_TAKEN = 'Username already exists or has been deleted'

/**
 * Sign-up dialog of the v3 console. When email verification is on, the
 * visitor gives an email, password and code (password before the code);
 * the username new-api requires is derived from the email. After a
 * successful registration it signs in with the same credentials — asking
 * Turnstile for a fresh token first when it is enabled — so a key for the
 * group picked on the landing page can be created right away.
 */
export function SignUpTerminal(props: { search: AuthSearch }) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const motion = useAuthMotion()
  const relay = useRef<RelayCanvasRef>(null)
  const navigate = useNavigate()
  const { handleLoginResult } = useAuthRedirect()
  const turnstile = useTurnstile()
  const [widgetKey, setWidgetKey] = useState(0)
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [stage, setStage] = useState<'form' | 'signing-in'>('form')
  const pendingLogin = useRef<{ username: string; password: string } | null>(
    null
  )

  useScrambleText()

  const [plan] = useState(
    () => planFromSearch(props.search) ?? readPendingPlan()
  )
  useEffect(() => {
    if (plan) savePendingPlan(plan)
  }, [plan])

  const emailMode = Boolean(status?.email_verification)
  const requiresConsent = Boolean(
    status?.user_agreement_enabled || status?.privacy_policy_enabled
  )
  const encrypt = status?.password_login_encryption_enabled === true
  const redirectTo = plan ? '/keys' : props.search.redirect

  const verification = useEmailVerification({
    turnstileToken: turnstile.turnstileToken,
    validateTurnstile: turnstile.validateTurnstile,
  })

  const refreshTurnstile = () => {
    if (!turnstile.isTurnstileEnabled) return
    turnstile.setTurnstileToken('')
    setWidgetKey((key) => key + 1)
  }

  async function signInAfterRegister(
    credentials: { username: string; password: string },
    token: string
  ) {
    try {
      const res = await login({
        username: credentials.username,
        password: credentials.password,
        turnstile: token,
        passwordEncryptionEnabled: encrypt,
      })
      if (!res.success) throw createServerError(res, t('Login failed'))
      if (isAuthBundle(res.data)) await motion.succeed()
      await handleLoginResult(res.data, redirectTo)
    } catch (error: unknown) {
      // The account exists; let the visitor sign in by hand.
      motion.reset()
      handleServerError(
        AuthOperationError.from(error, t('Account created. Please sign in.'))
      )
      setStage('form')
      void navigate({ to: '/sign-in', search: props.search })
    }
  }

  // With Turnstile on, the sign-in after registration needs a new token.
  useEffect(() => {
    const credentials = pendingLogin.current
    if (stage !== 'signing-in' || !credentials || !turnstile.turnstileToken) {
      return
    }
    pendingLogin.current = null
    const token = turnstile.turnstileToken
    turnstile.setTurnstileToken('')
    void signInAfterRegister(credentials, token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, turnstile.turnstileToken])

  function validate(): Errors {
    const next: Errors = {}
    if (emailMode) {
      if (!account.trim()) next.account = t('Please enter your email')
      else if (!isEmail(account)) {
        next.account = t('That email looks wrong; check the @ and the domain')
      }
    } else if (!account.trim()) {
      next.account = t('Please enter your username')
    } else if ([...account.trim()].length > 20) {
      next.account = t('Username must be at most 20 characters')
    }
    const pw = accountPasswordSchema.safeParse(password)
    if (!pw.success) {
      next.password = t('Password must contain between 8 and 128 characters.')
    }
    if (emailMode && !code.trim()) {
      next.code = t('Please enter the verification code')
    }
    return next
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (motion.busy) return
    const next = validate()
    setErrors(next)
    if (next.account || next.password || next.code) {
      motion.fail()
      let firstInvalid = 'auth-code'
      if (next.account) firstInvalid = 'auth-user'
      else if (next.password) firstInvalid = 'auth-pass'
      document.querySelector<HTMLElement>(`#${firstInvalid}`)?.focus()
      return
    }
    if (requiresConsent && !agreed) {
      motion.fail()
      handleServerError(new Error(t('Please agree to the legal terms first')))
      return
    }
    if (!turnstile.validateTurnstile()) return

    const token = turnstile.turnstileToken
    refreshTurnstile()
    motion.begin()
    relay.current?.burst()
    try {
      let username = emailMode ? deriveUsername(account) : account.trim()
      let res = await register({
        username,
        password,
        email: emailMode ? account.trim() : undefined,
        verification_code: emailMode ? code.trim() : undefined,
        aff_code: getAffiliateCode(),
        turnstile: token,
      })
      // A derived username can collide; retry once with a new suffix. The
      // Turnstile token was used, so this only works without Turnstile.
      if (
        !res.success &&
        emailMode &&
        res.message === USERNAME_TAKEN &&
        !turnstile.isTurnstileEnabled
      ) {
        username = deriveUsername(account)
        res = await register({
          username,
          password,
          email: account.trim(),
          verification_code: code.trim(),
          aff_code: getAffiliateCode(),
        })
      }
      await motion.settle()
      if (!res.success) {
        motion.fail()
        handleServerError(createServerError(res, t('Failed to create account')))
        return
      }
      const credentials = { username, password }
      setPassword('')
      if (turnstile.isTurnstileEnabled) {
        pendingLogin.current = credentials
        setStage('signing-in')
        return
      }
      await signInAfterRegister(credentials, '')
    } catch (error: unknown) {
      motion.fail()
      handleServerError(
        AuthOperationError.from(error, t('Failed to create account'))
      )
    }
  }

  async function sendCode() {
    if (!isEmail(account)) {
      setErrors((e) => ({
        ...e,
        account: t('That email looks wrong; check the @ and the domain'),
      }))
      motion.fail()
      return
    }
    if (await verification.sendCode(account.trim())) refreshTurnstile()
  }

  let sendLabel = t('Send')
  if (verification.isActive) sendLabel = `${verification.secondsLeft} s`
  else if (verification.isSending) sendLabel = t('Sending')

  return (
    <TerminalAuthFrame
      title={t('peroai sign up')}
      busy={motion.busy}
      boxClassName={motion.boxClassName}
      stillBackground={motion.crtOff}
      relayRef={relay}
    >
      <AuthTabs mode='up' search={props.search} />
      <p className='text-t-dim m-0 text-[13.5px] leading-[1.7]'>
        {plan
          ? t('Sign up and a key is created for the configuration you picked.')
          : t(
              'After signing up, create a key on the Keys page; top up and it is ready to call.'
            )}
      </p>
      {plan && <PlanBox plan={plan} mode='up' />}
      <form noValidate onSubmit={onSubmit} className='flex flex-col gap-4'>
        <TermField
          id='auth-user'
          label={emailMode ? t('Email') : t('Username')}
          error={errors.account}
        >
          <Input
            id='auth-user'
            type={emailMode ? 'email' : 'text'}
            autoComplete={emailMode ? 'email' : 'username'}
            placeholder={emailMode ? 'name@example.com' : ''}
            value={account}
            aria-invalid={Boolean(errors.account) || undefined}
            aria-describedby={errors.account ? 'auth-user-error' : undefined}
            onChange={(event) => {
              setAccount(event.target.value)
              if (errors.account) {
                setErrors((e) => ({ ...e, account: undefined }))
              }
            }}
            className={TERM_INPUT}
          />
        </TermField>
        <TermField
          id='auth-pass'
          label={t('Password')}
          error={errors.password}
          hint={t('At least 8 characters')}
        >
          <PasswordInput
            id='auth-pass'
            autoComplete='new-password'
            value={password}
            aria-invalid={Boolean(errors.password) || undefined}
            aria-describedby={errors.password ? 'auth-pass-error' : undefined}
            onChange={(event) => {
              setPassword(event.target.value)
              if (errors.password) {
                setErrors((e) => ({ ...e, password: undefined }))
              }
            }}
            className={TERM_PASSWORD}
          />
        </TermField>
        {emailMode && (
          <TermField
            id='auth-code'
            label={t('Email verification code')}
            error={errors.code}
          >
            <span className='flex gap-2'>
              <Input
                id='auth-code'
                inputMode='numeric'
                autoComplete='one-time-code'
                placeholder={t('6 digits')}
                value={code}
                aria-invalid={Boolean(errors.code) || undefined}
                onChange={(event) => {
                  setCode(event.target.value)
                  if (errors.code) setErrors((e) => ({ ...e, code: undefined }))
                }}
                className={`${TERM_INPUT} font-mono`}
              />
              <Button
                type='button'
                variant='outline'
                className={TERM_BUTTON}
                disabled={verification.isActive || verification.isSending}
                onClick={() => void sendCode()}
              >
                {sendLabel}
              </Button>
            </span>
          </TermField>
        )}
        <TurnstileRow
          enabled={turnstile.isTurnstileEnabled}
          siteKey={turnstile.turnstileSiteKey}
          widgetKey={widgetKey}
          onVerify={turnstile.setTurnstileToken}
          onExpire={() => turnstile.setTurnstileToken('')}
        />
        <TermLegalConsent
          status={status ?? null}
          checked={agreed}
          onCheckedChange={setAgreed}
        />
        {stage === 'signing-in' && (
          <pre
            className='text-t-fg2 m-0 font-mono text-[12.5px] leading-[1.75] whitespace-pre-wrap'
            aria-live='polite'
          >
            <span className='text-t-ok'>✓</span> {t('Account created')}
            {'\n  '}
            <span className='text-t-dim'>
              {t('Complete the human check above to sign in.')}
            </span>
          </pre>
        )}
        <SpinButton
          type='submit'
          state={
            stage === 'signing-in' && motion.spin === 'idle'
              ? 'pending'
              : motion.spin
          }
          label={t('Sign up')}
          pendingLabel={
            stage === 'signing-in' ? t('Signing in') : t('Signing up')
          }
          doneLabel={t('Signed up')}
        />
        <div className='text-t-dim flex justify-end text-[13px]'>
          <span>
            {t('Already have an account?')}{' '}
            <Link
              to='/sign-in'
              search={props.search}
              className='text-t-fg hover:text-t-accent'
            >
              {t('Sign in')}
            </Link>
          </span>
        </div>
      </form>
    </TerminalAuthFrame>
  )
}
