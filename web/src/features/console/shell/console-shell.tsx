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
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SignOutDialog } from '@/components/sign-out-dialog'
import { SkeletonText } from '@/components/terminal/data-states'
import { TermLogo } from '@/components/terminal/term-logo'
import { useScrambleText } from '@/components/terminal/use-scramble'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { useIsAdmin } from '@/hooks/use-admin'
import { useStatus } from '@/hooks/use-status'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { useSelfUser } from '../hooks/use-self-user'
import { consumeConsoleCrtOn, prefersReducedMotion } from '../lib/crt'
import {
  CONSOLE_WINDOWS,
  findConsoleWindow,
  isAccountPath,
  isShortcutTarget,
} from '../lib/windows'
import { usePlanKey } from './use-plan-key'

export const CREATE_KEY_EVENT = 'console:create-key'

/** Host shown in the status bar: the API address users configure. */
function apiHost(serverAddress: unknown): string {
  if (typeof serverAddress === 'string' && serverAddress) {
    try {
      return new URL(serverAddress).host
    } catch {
      /* fall through */
    }
  }
  return typeof window === 'undefined' ? '' : window.location.host
}

export function ConsoleKbd(props: { children: ReactNode }) {
  return (
    <Kbd className='border-t-faint text-t-fg2 h-auto min-w-0 rounded-[2px] border border-b-2 bg-transparent px-[5px] py-0 font-mono text-[11.5px] font-normal'>
      {props.children}
    </Kbd>
  )
}

/**
 * Console shell: tmux-style window bar on top, status bar at the bottom.
 * Replaces the sidebar layout for the user pages (overview, keys, logs,
 * wallet, models, status) and the account pages (profile, security).
 * Number keys 1–6 switch windows; `n` creates a key. Admin pages keep the
 * old layout and are reached via 「管理」.
 */
export function ConsoleShell(props: { children: ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const signedIn = useAuthStore((state) => Boolean(state.auth.user))
  const username = useAuthStore((state) => state.auth.user?.username)
  const isAdmin = useIsAdmin()
  const self = useSelfUser()
  const { status } = useStatus()
  const [signOutOpen, setSignOutOpen] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const current = findConsoleWindow(pathname)
  const onAccountPage = isAccountPath(pathname)

  useScrambleText()
  usePlanKey()

  useEffect(() => {
    if (!consumeConsoleCrtOn() || prefersReducedMotion()) return
    const el = bodyRef.current
    if (!el) return
    el.classList.add('t-crt-on')
    const timer = window.setTimeout(() => el.classList.remove('t-crt-on'), 600)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isShortcutTarget(event)) return
      if (/^[1-6]$/.test(event.key)) {
        const win = CONSOLE_WINDOWS[Number(event.key) - 1]
        if (win) void navigate({ to: win.path })
        return
      }
      if (event.key === 'n' && signedIn) {
        event.preventDefault()
        if (pathname === '/keys') {
          window.dispatchEvent(new CustomEvent(CREATE_KEY_EVENT))
        } else {
          void navigate({ to: '/keys', search: { create: true } })
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navigate, pathname, signedIn])

  const balance = self.data ? formatQuota(self.data.quota) : null
  const statusLoaded = Boolean(status)

  return (
    <div className='bg-t-bg text-t-fg flex min-h-svh flex-col'>
      <header className='border-t-line bg-t-bg sticky top-0 z-10 flex h-[54px] items-center gap-5 border-b px-4 pt-[env(safe-area-inset-top,0px)] max-md:h-auto max-md:flex-wrap max-md:gap-x-4 max-md:gap-y-1 max-md:pt-2.5'>
        <TermLogo />
        <nav
          aria-label={t('Console pages')}
          className='flex min-w-0 [scrollbar-width:none] gap-0.5 overflow-x-auto max-md:order-3 max-md:-mx-2.5 max-md:w-[calc(100%+20px)] max-md:pb-1.5'
        >
          {CONSOLE_WINDOWS.map((win, index) => {
            const active = current?.key === win.key
            return (
              <Link
                key={win.key}
                to={win.path}
                data-scramble=''
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'px-2.5 py-[5px] font-mono text-[13px] whitespace-nowrap',
                  active ? 'bg-t-fg text-t-bg' : 'text-t-dim hover:text-t-fg'
                )}
              >
                {index + 1} <span className='font-sans'>{t(win.labelKey)}</span>
              </Link>
            )
          })}
        </nav>
        <div className='text-t-dim ml-auto flex flex-none items-center gap-3 text-[13px]'>
          {signedIn ? (
            <>
              <span className='max-md:hidden'>{t('Balance')}</span>
              <b className='text-t-fg font-mono text-sm font-medium'>
                {balance ?? <SkeletonText />}
              </b>
              <Button
                size='sm'
                variant='outline'
                render={<Link to='/wallet' />}
                className='rounded-[2px]'
              >
                {t('Top up')}
              </Button>
            </>
          ) : (
            <>
              <Link to='/sign-in' data-scramble='' className='hover:text-t-fg'>
                {t('Sign in')}
              </Link>
              <Button
                size='sm'
                render={<Link to='/sign-up' />}
                className='hover:bg-t-pink rounded-[2px]'
              >
                {t('Sign up')}
              </Button>
            </>
          )}
        </div>
      </header>

      <div ref={bodyRef} className='flex flex-1 flex-col'>
        <main
          id='content'
          className='mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-[34px] px-4 pt-[30px] pb-14'
        >
          {props.children}
        </main>
      </div>

      <footer className='border-t-line bg-t-bg text-t-dim sticky bottom-0 z-10 flex h-9 items-center gap-[18px] overflow-hidden border-t px-4 pb-[env(safe-area-inset-bottom,0px)] font-mono text-xs whitespace-nowrap'>
        <span className='flex items-center gap-3.5 max-md:hidden'>
          <span>
            <ConsoleKbd>1</ConsoleKbd>–<ConsoleKbd>6</ConsoleKbd>{' '}
            {t('Switch page')}
          </span>
          {signedIn && (
            <span>
              <ConsoleKbd>n</ConsoleKbd> {t('Create Key')}
            </span>
          )}
        </span>
        <span className='ml-auto flex items-center gap-4'>
          {signedIn && username && (
            <span className='max-sm:hidden'>{username}</span>
          )}
          <span>
            <span
              className={statusLoaded ? 'text-t-ok' : 'text-t-warn'}
              aria-hidden='true'
            >
              ●
            </span>{' '}
            {apiHost(status?.server_address)}{' '}
            {statusLoaded ? t('online') : t('connecting')}
          </span>
          {signedIn && isAdmin && (
            <Link to='/channels' data-scramble='' className='hover:text-t-fg'>
              {t('Manage')}
            </Link>
          )}
          {signedIn && (
            <Link
              to='/profile'
              data-scramble=''
              aria-current={onAccountPage ? 'page' : undefined}
              className={cn(
                'hover:text-t-fg',
                onAccountPage && 'text-t-fg border-t-pink border-b'
              )}
            >
              {t('Account')}
            </Link>
          )}
          {signedIn && (
            <button
              type='button'
              data-scramble=''
              className='hover:text-t-fg'
              onClick={() => setSignOutOpen(true)}
            >
              {t('Log out')}
            </button>
          )}
        </span>
      </footer>
      {signedIn && (
        <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
      )}
    </div>
  )
}

/** Page header: title + one line of help, optional actions on the right. */
export function ConsolePageHeader(props: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className='flex flex-wrap items-end justify-between gap-4'>
      <div>
        <h1 className='mb-1.5 text-xl font-bold'>{props.title}</h1>
        {props.description != null && (
          <p className='text-t-dim m-0 max-w-[46em] text-sm leading-[1.7]'>
            {props.description}
          </p>
        )}
      </div>
      {props.actions}
    </div>
  )
}
