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
import { ArrowRight, Menu, X } from 'lucide-react'
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'motion/react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationPopover } from '@/components/notification-popover'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SystemUpdateAction } from '@/features/system-update/system-update-action'
import { useNotifications } from '@/hooks/use-notifications'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { defaultTopNavLinks } from '../config/top-nav.config'
import type { TopNavLink } from '../types'
import { HeaderLogo } from './header-logo'

const AUTH_PROMPT_SECONDS = 5
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

const primaryAction = cn(
  'bg-foreground text-background hover:bg-foreground/85 inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors duration-200 active:scale-[0.98]',
  focusRing
)

type AuthPromptTarget = {
  title: string
  href: string
}

export interface PublicHeaderProps {
  navLinks?: TopNavLink[]
  mobileLinks?: TopNavLink[]
  navContent?: React.ReactNode
  showThemeSwitch?: boolean
  showLanguageSwitcher?: boolean
  logo?: React.ReactNode
  siteName?: string
  homeUrl?: string
  leftContent?: React.ReactNode
  rightContent?: React.ReactNode
  showNavigation?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  className?: string
}

export function PublicHeader(props: PublicHeaderProps) {
  const {
    navLinks = defaultTopNavLinks,
    showThemeSwitch = true,
    showLanguageSwitcher = true,
    logo: customLogo,
    siteName: customSiteName,
    homeUrl = '/',
    showAuthButtons = true,
    showNotifications = true,
  } = props

  const { t } = useTranslation()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [condensed, setCondensed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authPromptTarget, setAuthPromptTarget] =
    useState<AuthPromptTarget | null>(null)
  const [authPromptSecondsLeft, setAuthPromptSecondsLeft] =
    useState(AUTH_PROMPT_SECONDS)
  const { auth } = useAuthStore()
  const {
    systemName,
    logo: systemLogo,
    loading,
    logoLoaded,
  } = useSystemConfig()
  const dynamicLinks = useTopNavLinks()
  const notifications = useNotifications()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  const user = auth.user
  const isAuthenticated = !!user
  const displaySiteName = customSiteName || systemName
  const links = dynamicLinks.length > 0 ? dynamicLinks : navLinks

  let logoContent: ReactNode = (
    <HeaderLogo
      src={systemLogo}
      loading={loading}
      logoLoaded={logoLoaded}
      className='size-full rounded-md object-contain'
    />
  )
  if (customLogo) logoContent = customLogo
  if (loading) logoContent = <Skeleton className='size-full rounded-md' />

  let authContent: ReactNode = (
    <Link to='/sign-in' className={primaryAction}>
      {t('Sign in')}
      <ArrowRight className='size-3.5' strokeWidth={1.75} aria-hidden />
    </Link>
  )
  if (isAuthenticated) authContent = <ProfileDropdown />
  if (loading) authContent = <Skeleton className='h-9 w-24 rounded-full' />

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      setCondensed(window.scrollY > 24)
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  useEffect(() => {
    if (!authPromptTarget) return

    const intervalId = window.setInterval(() => {
      setAuthPromptSecondsLeft((seconds) => Math.max(seconds - 1, 0))
    }, 1000)

    const timeoutId = window.setTimeout(() => {
      const redirect = authPromptTarget.href
      setAuthPromptTarget(null)
      navigate({ to: '/sign-in', search: { redirect } })
    }, AUTH_PROMPT_SECONDS * 1000)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }
  }, [authPromptTarget, navigate])

  const closeAuthPrompt = useCallback(() => {
    setAuthPromptTarget(null)
    setAuthPromptSecondsLeft(AUTH_PROMPT_SECONDS)
  }, [])

  const navigateToSignIn = useCallback(() => {
    const redirect = authPromptTarget?.href || '/'
    setAuthPromptTarget(null)
    navigate({ to: '/sign-in', search: { redirect } })
  }, [authPromptTarget?.href, navigate])

  const handleNavLinkClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, link: TopNavLink) => {
      setMobileOpen(false)
      if (link.disabled) {
        event.preventDefault()
        return
      }
      if (!link.requiresAuth) return
      event.preventDefault()
      setAuthPromptSecondsLeft(AUTH_PROMPT_SECONDS)
      setAuthPromptTarget({ title: t(link.title), href: link.href })
    },
    [t]
  )

  const layoutTransition = { duration: reduce ? 0 : 0.45, ease: EASE }
  const pillTransition = reduce
    ? { duration: 0 }
    : { type: 'spring' as const, bounce: 0, duration: 0.4 }

  const renderLink = (
    link: TopNavLink,
    index: number,
    variant: 'bar' | 'menu'
  ) => {
    const isActive = pathname === link.href
    const label = t(link.title)
    const className =
      variant === 'bar'
        ? cn(
            'relative flex h-9 min-w-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors duration-200',
            focusRing,
            isActive
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground',
            link.disabled && 'pointer-events-none opacity-50'
          )
        : cn(
            'flex h-12 items-center gap-3 rounded-2xl px-4 text-[15px] font-medium transition-colors duration-200',
            focusRing,
            isActive
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted/60',
            link.disabled && 'pointer-events-none opacity-50'
          )
    const content = (
      <>
        {variant === 'bar' && isActive && (
          <motion.span
            layoutId='public-header-indicator'
            transition={pillTransition}
            style={{ borderRadius: 9999 }}
            className='bg-muted absolute inset-0'
          />
        )}
        <span
          aria-hidden
          className={cn(
            'font-ascii relative text-[10px] tabular-nums',
            isActive ? 'text-landing-accent' : 'text-muted-foreground/60'
          )}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className='relative truncate'>{label}</span>
        {variant === 'menu' && isActive && (
          <span className='font-ascii text-muted-foreground ml-auto text-xs'>
            {'<'} {t('You are here')}
          </span>
        )}
      </>
    )

    if (link.external) {
      return (
        <a
          href={link.href}
          title={label}
          target='_blank'
          rel='noopener noreferrer'
          aria-disabled={link.disabled}
          tabIndex={link.disabled ? -1 : undefined}
          onClick={(event) => handleNavLinkClick(event, link)}
          className={className}
        >
          {content}
        </a>
      )
    }
    return (
      <Link
        to={link.href}
        title={label}
        disabled={link.disabled}
        aria-current={isActive ? 'page' : undefined}
        onClick={(event) => handleNavLinkClick(event, link)}
        className={className}
      >
        {content}
      </Link>
    )
  }

  return (
    <>
      <header className='pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-2 sm:px-6'>
        <LayoutGroup>
          <div className='mx-auto flex w-full max-w-7xl justify-center'>
            <motion.nav
              layout
              aria-label={t('Primary')}
              initial={{ opacity: 0, y: reduce ? 0 : -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                layout: layoutTransition,
                duration: 0.6,
                ease: EASE,
              }}
              style={{ borderRadius: 9999 }}
              className={cn(
                'pointer-events-auto relative flex items-center',
                condensed
                  ? 'bg-background/80 ring-border h-14 w-full gap-2 pr-2 pl-4 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.25)] ring-1 backdrop-blur-xl lg:w-auto lg:gap-4'
                  : 'h-16 w-full justify-between gap-4 px-1'
              )}
            >
              <motion.div
                layout='position'
                transition={layoutTransition}
                className={cn(
                  // `@container` uses inline-size containment, so the brand
                  // needs a definite width instead of shrinking to content.
                  '@container/system-brand flex min-w-0 flex-1 items-center gap-1 lg:min-w-36',
                  condensed && 'lg:w-48 lg:flex-none'
                )}
              >
                <Link
                  to={homeUrl}
                  className={cn(
                    'group flex min-w-0 items-center gap-2.5 rounded-full',
                    focusRing
                  )}
                >
                  <span className='flex size-7 shrink-0 items-center justify-center transition-transform duration-300 group-hover:scale-105'>
                    {logoContent}
                  </span>
                  <span
                    className='max-w-44 truncate text-[15px] font-semibold tracking-tight'
                    title={displaySiteName}
                  >
                    {loading ? (
                      <Skeleton className='h-4 w-16' />
                    ) : (
                      displaySiteName
                    )}
                  </span>
                </Link>
                <SystemUpdateAction presentation='version' />
              </motion.div>

              <motion.ul
                layout='position'
                transition={layoutTransition}
                className={cn(
                  'hidden min-w-0 items-center gap-0.5 lg:flex',
                  !condensed && 'absolute left-1/2 -translate-x-1/2'
                )}
              >
                {links.map((link, index) => (
                  <li key={`${link.title}:${link.href}`} className='min-w-0'>
                    {renderLink(link, index, 'bar')}
                  </li>
                ))}
              </motion.ul>

              <motion.div
                layout='position'
                transition={layoutTransition}
                className='flex shrink-0 items-center gap-1'
              >
                <div className='hidden items-center gap-0.5 lg:flex'>
                  {showLanguageSwitcher && <LanguageSwitcher />}
                  {showThemeSwitch && <ThemeSwitch />}
                  {showNotifications && (
                    <NotificationPopover
                      open={notifications.popoverOpen}
                      onOpenChange={notifications.setPopoverOpen}
                      unreadCount={notifications.unreadCount}
                      activeTab={notifications.activeTab}
                      onTabChange={notifications.setActiveTab}
                      notice={notifications.notice}
                      announcements={notifications.announcements}
                      loading={notifications.loading}
                    />
                  )}
                  {showAuthButtons && (
                    <span className='ml-1.5'>{authContent}</span>
                  )}
                </div>

                <div className='flex items-center gap-1 lg:hidden'>
                  {showThemeSwitch && <ThemeSwitch />}
                  {showAuthButtons && !loading && isAuthenticated && (
                    <ProfileDropdown />
                  )}
                  <button
                    type='button'
                    onClick={() => setMobileOpen((value) => !value)}
                    aria-expanded={mobileOpen}
                    aria-controls='public-header-menu'
                    aria-label={t('Toggle navigation menu')}
                    className={cn(
                      'hover:bg-muted flex size-11 items-center justify-center rounded-full transition-colors duration-200',
                      focusRing
                    )}
                  >
                    {mobileOpen ? (
                      <X className='size-5' strokeWidth={1.75} />
                    ) : (
                      <Menu className='size-5' strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.nav>
          </div>
        </LayoutGroup>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              id='public-header-menu'
              initial={{ opacity: 0, y: reduce ? 0 : -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: reduce ? 0 : -6,
                transition: { duration: 0.15 },
              }}
              transition={{ duration: 0.3, ease: EASE }}
              className='bg-background ring-border pointer-events-auto mx-auto mt-2 w-full max-w-7xl rounded-[28px] p-2 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.3)] ring-1 lg:hidden'
            >
              <p className='font-ascii text-muted-foreground/70 px-4 pt-2 pb-1 text-[11px]'>
                {'// '}
                {displaySiteName}
              </p>
              <ul>
                {links.map((link, index) => (
                  <li key={`${link.title}:${link.href}`}>
                    {renderLink(link, index, 'menu')}
                  </li>
                ))}
              </ul>
              <div className='ascii-rule mx-4 my-2' aria-hidden />
              <div className='flex items-center justify-between gap-2 px-2 pb-1'>
                <div className='flex items-center gap-0.5'>
                  {showLanguageSwitcher && <LanguageSwitcher />}
                  {showNotifications && (
                    <NotificationPopover
                      open={notifications.popoverOpen}
                      onOpenChange={notifications.setPopoverOpen}
                      unreadCount={notifications.unreadCount}
                      activeTab={notifications.activeTab}
                      onTabChange={notifications.setActiveTab}
                      notice={notifications.notice}
                      announcements={notifications.announcements}
                      loading={notifications.loading}
                    />
                  )}
                </div>
                {showAuthButtons && (
                  <Link
                    to={isAuthenticated ? '/dashboard' : '/sign-in'}
                    onClick={() => setMobileOpen(false)}
                    className={cn(primaryAction, 'h-11 px-5')}
                  >
                    {isAuthenticated ? t('Go to Dashboard') : t('Sign in')}
                    <ArrowRight
                      className='size-4'
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <Dialog
        open={!!authPromptTarget}
        onOpenChange={(open) => {
          if (!open) {
            closeAuthPrompt()
          }
        }}
        title={t('Sign in required')}
        description={t('Please sign in to view {{module}}.', {
          module: authPromptTarget?.title || '',
        })}
        contentClassName='sm:max-w-md'
        contentHeight='auto'
        footer={
          <>
            <Button variant='outline' onClick={closeAuthPrompt}>
              {t('Cancel')}
            </Button>
            <Button onClick={navigateToSignIn}>{t('Sign in now')}</Button>
          </>
        }
      >
        <div className='bg-muted/40 text-muted-foreground rounded-lg px-3 py-2 text-sm'>
          {t('Redirecting to sign in in {{seconds}} seconds.', {
            seconds: authPromptSecondsLeft,
          })}
        </div>
      </Dialog>
    </>
  )
}
