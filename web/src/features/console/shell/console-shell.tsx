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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import { SignOutDialog } from '@/components/sign-out-dialog'
import { SkeletonText } from '@/components/terminal/data-states'
import { RollingNumber } from '@/components/terminal/rolling-number'
import { SonarBackdrop } from '@/components/terminal/sonar-backdrop'
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

type TabMark = { x: number; w: number; shown: boolean }
type TabSlide = { from: TabMark; to: TabMark; startedAt: number }

// Same curves as --t-ease and --t-spring in theme-presets.css. The block
// slides on the spring where the browser understands linear() easing.
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const SPRING =
  'linear(0, 0.0663, 0.2153, 0.3916, 0.5618, 0.708, 0.8234, 0.9081, 0.9656, 1.0013, 1.0208, 1.0289, 1.0299, 1.0269, 1.022, 1.0166, 1.0117, 1.0076, 1.0044, 1.0021, 1.0006, 0.9997, 0.9993, 0.9991, 0.9991, 0.9992, 0.9994, 0.9996, 1)'
const canSpring =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('transition-timing-function', 'linear(0, 1)')
const SLIDE_EASE = canSpring ? SPRING : EASE
const SLIDE_MS = canSpring ? 620 : 420

/**
 * The selected-tab block, its slide in progress, and the last page.
 * `/pricing` and `/status` mount their own shell, so moving to or from them
 * replaces this component mid-slide; the new shell picks the slide up from
 * here instead of drawing the block straight at the new tab.
 */
const shellMemory: {
  tabMark: TabMark | null
  slide: TabSlide | null
  pathname: string | null
} = { tabMark: null, slide: null, pathname: null }

function sameSpot(a: TabMark | null, b: TabMark): boolean {
  return a !== null && a.x === b.x && a.w === b.w && a.shown === b.shown
}

/**
 * Runs `start` once `el` is laid out. While a route is still loading its
 * new tree is mounted hidden, and an animation started then plays unseen.
 */
function whenDrawn(el: HTMLElement, start: () => void): () => void {
  let frame = 0
  let tries = 0
  const check = () => {
    if (el.getClientRects().length > 0) {
      start()
      return
    }
    tries += 1
    if (tries < 90) frame = window.requestAnimationFrame(check)
  }
  check()
  return () => window.cancelAnimationFrame(frame)
}

/** Slides the block along `slide`, already `elapsed` into it. */
function playTabSlide(el: HTMLElement | null, slide: TabSlide): () => void {
  if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) {
    return () => undefined
  }
  return whenDrawn(el, () => {
    const elapsed = performance.now() - slide.startedAt
    if (elapsed >= SLIDE_MS) return
    for (const animation of el.getAnimations?.() ?? []) animation.cancel()
    el.animate(
      [
        {
          transform: `translateX(${slide.from.x}px)`,
          width: `${slide.from.w}px`,
        },
        { transform: `translateX(${slide.to.x}px)`, width: `${slide.to.w}px` },
      ],
      { duration: SLIDE_MS, delay: -elapsed, easing: SLIDE_EASE }
    )
  })
}

/** Where the block is drawn now, mid-slide included. */
function drawnTabMark(el: HTMLElement | null, fallback: TabMark): TabMark {
  if (!el || el.getClientRects().length === 0) return fallback
  const style = getComputedStyle(el)
  const matrix = /matrix\(([^)]+)\)/.exec(style.transform)
  const x = matrix ? Number(matrix[1].split(',')[4]) : fallback.x
  return { x, w: Number.parseFloat(style.width) || fallback.w, shown: true }
}

export function ConsoleKbd(props: { children: ReactNode }) {
  return (
    <Kbd className='text-t-fg2 h-auto min-w-0 rounded-md border-0 bg-white/5 px-[5px] py-0 font-mono text-[11.5px] font-normal shadow-[inset_0_0_0_1px_var(--t-hair),0_1px_0_rgb(0_0_0/0.6)]'>
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
  const mainRef = useRef<HTMLElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const markRef = useRef<HTMLSpanElement>(null)
  const crtOn = useRef(false)
  const routeLoading = useRouterState({ select: (s) => s.status === 'pending' })
  const [tabMark, setTabMark] = useState<TabMark>(
    () => shellMemory.tabMark ?? { x: 0, w: 0, shown: false }
  )
  const stopSlide = useRef<() => void>(() => undefined)
  const current = findConsoleWindow(pathname)

  // Moves the selected-tab block, sliding when it was already showing.
  const moveTabMark = useCallback((next: TabMark) => {
    const before = shellMemory.tabMark
    if (sameSpot(before, next)) return
    shellMemory.tabMark = next
    setTabMark(next)
    stopSlide.current()
    if (!before?.shown || !next.shown) {
      shellMemory.slide = null
      return
    }
    const el = markRef.current
    const from = drawnTabMark(el, before)
    shellMemory.slide = { from, to: next, startedAt: performance.now() }
    stopSlide.current = playTabSlide(el, shellMemory.slide)
  }, [])

  const placeTabMarkOn = useCallback(
    (tab: HTMLElement) =>
      moveTabMark({ x: tab.offsetLeft, w: tab.offsetWidth, shown: true }),
    [moveTabMark]
  )
  const onAccountPage = isAccountPath(pathname)

  useScrambleText()
  usePlanKey()

  useEffect(() => {
    if (!consumeConsoleCrtOn() || prefersReducedMotion()) return
    const el = bodyRef.current
    if (!el) return
    crtOn.current = true
    // The whole page switches on; panes rising in on top of that would be
    // a second, competing motion. Skip their rise (and the table rows
    // dropping in) for panes already here and any that mount during it.
    const settlePanes = () => {
      for (const animation of el.getAnimations?.({ subtree: true }) ?? []) {
        const name = (animation as CSSAnimation).animationName
        if (name === 't-rise' || name === 'tableRowEnter') animation.finish()
      }
    }
    el.classList.add('t-crt-on')
    settlePanes()
    const timer = window.setTimeout(() => {
      el.classList.remove('t-crt-on')
      settlePanes()
    }, 600)
    return () => window.clearTimeout(timer)
  }, [])

  // A faint light on the pane under the pointer follows it (`.t-pane::after`
  // reads --mx / --my). At most one update per frame; touch has no hover.
  useEffect(() => {
    const body = bodyRef.current
    if (!body || prefersReducedMotion()) return
    let frame = 0
    let last: PointerEvent | null = null
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      last = event
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const target = last?.target
        if (!last || !(target instanceof Element)) return
        const pane = target.closest<HTMLElement>('.t-pane')
        if (!pane) return
        const box = pane.getBoundingClientRect()
        pane.style.setProperty(
          '--mx',
          `${Math.round(last.clientX - box.left)}px`
        )
        pane.style.setProperty(
          '--my',
          `${Math.round(last.clientY - box.top)}px`
        )
      })
    }
    body.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      body.removeEventListener('pointermove', onMove)
      window.cancelAnimationFrame(frame)
    }
  }, [])

  // A shell that mounts mid-slide (to or from /pricing, /status) carries on
  // with that slide rather than drawing the block at the end of it.
  useLayoutEffect(() => {
    const slide = shellMemory.slide
    if (slide && sameSpot(shellMemory.tabMark, slide.to)) {
      stopSlide.current = playTabSlide(markRef.current, slide)
    }
    return () => stopSlide.current()
  }, [])

  // Keep the block on the current tab: after each page change, once the
  // route finishes loading (a click may have moved it to a page that then
  // redirected), and when tab widths change with the font or language.
  useLayoutEffect(() => {
    const nav = navRef.current
    const tab = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !tab) {
      if (!routeLoading) {
        const last = shellMemory.tabMark ?? { x: 0, w: 0, shown: false }
        moveTabMark({ ...last, shown: false })
      }
      return
    }
    placeTabMarkOn(tab)
    const observer = new ResizeObserver(() => placeTabMarkOn(tab))
    observer.observe(nav)
    observer.observe(tab)
    return () => observer.disconnect()
  }, [current?.key, routeLoading, moveTabMark, placeTabMarkOn])

  // A new page fades up into place. The first page after sign-in has the
  // CRT-on instead.
  useEffect(() => {
    const previous = shellMemory.pathname
    shellMemory.pathname = pathname
    if (previous === null || previous === pathname || crtOn.current) return
    const main = mainRef.current
    if (!main || typeof main.animate !== 'function' || prefersReducedMotion()) {
      return
    }
    return whenDrawn(main, () => {
      main.animate(
        [
          { opacity: 0, transform: 'translateY(8px)', filter: 'blur(4px)' },
          { opacity: 1, transform: 'none', filter: 'blur(0px)' },
        ],
        { duration: 420, easing: EASE }
      )
    })
  }, [pathname])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isShortcutTarget(event)) return
      if (/^[1-6]$/.test(event.key)) {
        const index = Number(event.key) - 1
        const win = CONSOLE_WINDOWS[index]
        if (!win) return
        // Move the block now; the page may take a moment to load.
        const tab = navRef.current?.querySelectorAll('a')[index]
        if (tab) placeTabMarkOn(tab)
        void navigate({ to: win.path })
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
  }, [navigate, pathname, signedIn, placeTabMarkOn])

  const balance = self.data ? formatQuota(self.data.quota) : null
  const statusLoaded = Boolean(status)

  return (
    <div className='text-t-fg flex min-h-svh flex-col'>
      {/* Backdrop of every console page: the sonar relay (requests flowing
       * into api.peroai.cc send sonar rings through a glyph field) over a
       * faint grid. Panes sit on it like the cards of the v4 landing page. */}
      <SonarBackdrop className='fixed inset-0 -z-10' />
      <header className='border-t-line bg-t-bg/75 sticky top-0 z-10 flex h-[58px] items-center gap-5 border-b px-4 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl max-md:h-auto max-md:flex-wrap max-md:gap-x-4 max-md:gap-y-1 max-md:pt-2.5'>
        <TermLogo />
        <nav
          ref={navRef}
          aria-label={t('Console pages')}
          className='relative flex min-w-0 [scrollbar-width:none] gap-0.5 overflow-x-auto max-md:order-3 max-md:-mx-2.5 max-md:w-[calc(100%+20px)] max-md:pb-1.5'
        >
          <span
            ref={markRef}
            aria-hidden='true'
            className='t-tab-mark max-md:h-[calc(100%-6px)]'
            style={{
              width: tabMark.w,
              transform: `translateX(${tabMark.x}px)`,
              opacity: tabMark.shown ? 1 : 0,
            }}
          />
          {CONSOLE_WINDOWS.map((win, index) => {
            const active = current?.key === win.key
            return (
              <Link
                key={win.key}
                to={win.path}
                data-scramble=''
                aria-current={active ? 'page' : undefined}
                onClick={(event) => {
                  const plain =
                    event.button === 0 &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    !event.altKey
                  if (plain) placeTabMarkOn(event.currentTarget)
                }}
                className={cn(
                  'relative z-[1] rounded-full px-3 py-[5px] font-mono text-[13px] whitespace-nowrap',
                  active ? 'text-t-fg' : 'text-t-dim hover:text-t-fg'
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
                {balance ? <RollingNumber text={balance} /> : <SkeletonText />}
              </b>
              <Button
                size='sm'
                variant='outline'
                render={<Link to='/wallet' />}
                className='rounded-full'
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
                className='rounded-full hover:bg-white'
              >
                {t('Sign up')}
              </Button>
            </>
          )}
        </div>
      </header>

      <div ref={bodyRef} className='flex flex-1 flex-col'>
        <main
          ref={mainRef}
          id='content'
          className='mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-[34px] px-4 pt-[30px] pb-14'
        >
          {props.children}
        </main>
      </div>

      <footer className='border-t-line bg-t-bg/75 text-t-dim sticky bottom-0 z-10 flex h-9 items-center gap-[18px] overflow-hidden border-t px-4 pb-[env(safe-area-inset-bottom,0px)] font-mono text-xs whitespace-nowrap backdrop-blur-xl'>
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
              className={statusLoaded ? 't-live text-t-ok' : 'text-t-warn'}
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
                onAccountPage && 'text-t-fg border-(--t-accent) border-b'
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
