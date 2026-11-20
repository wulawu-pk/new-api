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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Turnstile } from '@/components/turnstile'
import { Label } from '@/components/ui/label'
import { LegalConsent } from '@/features/auth/components/legal-consent'
import type { SystemStatus } from '@/features/auth/types'

import { groupName } from '../../lib/groups'
import type { PendingPlan } from '../lib/pending-plan'

/** Search params carried between the sign-in and sign-up tabs. */
export type AuthSearch = {
  redirect?: string
  plan?: string
  model?: string
  client?: string
}

/** `[ 登录 ]  注册` — tabs as links so the address matches the mode. */
export function AuthTabs(props: { mode: 'in' | 'up'; search: AuthSearch }) {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('Sign in or sign up')}
      className='flex gap-3.5 font-mono text-[13.5px]'
    >
      <Link
        to='/sign-in'
        search={props.search}
        data-scramble=''
        aria-current={props.mode === 'in' ? 'page' : undefined}
        className='t-bracket text-t-dim aria-[current=page]:text-t-pink'
      >
        {t('Sign in')}
      </Link>
      <Link
        to='/sign-up'
        search={props.search}
        data-scramble=''
        aria-current={props.mode === 'up' ? 'page' : undefined}
        className='t-bracket text-t-dim aria-[current=page]:text-t-pink'
      >
        {t('Sign up')}
      </Link>
    </nav>
  )
}

/** "Configuration chosen on the home page" box. */
export function PlanBox(props: { plan: PendingPlan; mode: 'in' | 'up' }) {
  const { t } = useTranslation()
  return (
    <pre className='text-t-fg2 m-0 overflow-hidden font-mono text-[12.5px] leading-[1.75] whitespace-pre-wrap'>
      <span className='text-t-dim'>{t('Configuration you picked')}</span>
      {'\n  '}
      {props.plan.client ?? '—'} <span className='text-t-dim'>×</span>{' '}
      <span className='text-t-pink'>
        {props.plan.model ?? props.plan.group}
      </span>
      {'\n  '}
      <span className='text-t-dim'>
        {props.mode === 'up'
          ? t(
              'After sign-up a key in the 「{{group}}」 group is created for you',
              {
                group: groupName(props.plan.group, t),
              }
            )
          : t(
              'After sign-in a key in the 「{{group}}」 group is created for you',
              {
                group: groupName(props.plan.group, t),
              }
            )}
      </span>
    </pre>
  )
}

/** Label + control + field error, laid out like the spec's `.field`. */
export function TermField(props: {
  id: string
  label: ReactNode
  error?: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className='flex min-w-0 flex-col gap-[7px]'>
      <Label htmlFor={props.id} className='text-t-fg2 text-[13px] font-normal'>
        {props.label}
      </Label>
      {props.children}
      {props.hint != null && !props.error && (
        <small className='text-t-dim text-[12.5px] leading-[1.6]'>
          {props.hint}
        </small>
      )}
      {props.error && (
        <span
          id={`${props.id}-error`}
          role='alert'
          className='text-t-bad text-[12.5px]'
        >
          {props.error}
        </span>
      )}
    </div>
  )
}

/** Cloudflare Turnstile, framed like the spec's verification row. */
export function TurnstileRow(props: {
  enabled: boolean
  siteKey: string
  widgetKey: number
  onVerify: (token: string) => void
  onExpire: () => void
}) {
  if (!props.enabled) return null
  return (
    <div className='border-t-faint bg-t-bg2 overflow-hidden border p-1.5'>
      <Turnstile
        key={props.widgetKey}
        siteKey={props.siteKey}
        onVerify={props.onVerify}
        onExpire={props.onExpire}
      />
    </div>
  )
}

/** Legal consent restyled as the spec's plain checkbox line. */
export function TermLegalConsent(props: {
  status: SystemStatus | null
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  return (
    <LegalConsent
      status={props.status}
      checked={props.checked}
      onCheckedChange={props.onCheckedChange}
      className='[&_a]:text-t-fg [&_a]:border-t-faint [&_label]:text-t-fg2 border-0 bg-transparent p-0 [&_a]:border-b [&_label]:text-[13px]'
    />
  )
}
