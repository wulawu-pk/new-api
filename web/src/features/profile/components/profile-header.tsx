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
import { Activity, BarChart3, WalletCards } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { CONSOLE_EYEBROW, CONSOLE_FRAME } from '@/lib/console-surface'
import { formatCompactNumber, formatQuota } from '@/lib/format'
import { getRoleLabel } from '@/lib/roles'
import { cn } from '@/lib/utils'

import { getDisplayName } from '../lib'
import type { UserProfile } from '../types'

interface ProfileHeaderProps {
  profile: UserProfile | null
  loading: boolean
}

const STAT_KEYS = ['balance', 'usage', 'requests'] as const

/** Account identity over the landing ASCII grid, with a ruled stats row. */
export function ProfileHeader({ profile, loading }: ProfileHeaderProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  if (loading) {
    return (
      <section aria-busy className={CONSOLE_FRAME}>
        <div className='flex items-center gap-4 p-5 sm:p-7'>
          <Skeleton className='size-12 rounded-2xl sm:size-16' />
          <div className='space-y-3'>
            <Skeleton className='h-3.5 w-32' />
            <Skeleton className='h-8 w-48' />
            <Skeleton className='h-4 w-56' />
          </div>
        </div>
        <div className='divide-border grid grid-cols-3 divide-x border-t'>
          {STAT_KEYS.map((key) => (
            <div key={key} className='px-4 py-4 sm:px-6'>
              <Skeleton className='h-3.5 w-20' />
              <Skeleton className='mt-2.5 h-7 w-28' />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (!profile) return null

  const displayName = getDisplayName(profile)
  const avatarName = profile.username || displayName
  const stats = [
    {
      key: 'balance',
      label: t('Current Balance'),
      value: formatQuota(profile.quota),
      description: t('Remaining quota'),
      icon: WalletCards,
    },
    {
      key: 'usage',
      label: t('Total Usage'),
      value: formatQuota(profile.used_quota),
      description: t('Total consumed quota'),
      icon: BarChart3,
    },
    {
      key: 'requests',
      label: t('API Requests'),
      value: formatCompactNumber(profile.request_count, locale),
      description: t('Total requests made'),
      icon: Activity,
    },
  ]
  const meta = [profile.email, profile.group].filter(Boolean)

  return (
    <section className={CONSOLE_FRAME}>
      <div className='bg-muted/30 relative overflow-hidden'>
        <div
          aria-hidden
          className='ascii-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_80%_100%_at_100%_0%,black,transparent)] opacity-40'
        />
        <div className='relative flex items-center gap-4 p-5 sm:gap-5 sm:p-7'>
          <Avatar className='ring-background size-12 rounded-2xl text-sm ring-4 sm:size-16 sm:text-lg'>
            <AvatarFallback
              className='rounded-2xl font-semibold text-white'
              style={getUserAvatarStyle(avatarName)}
            >
              {getUserAvatarFallback(avatarName)}
            </AvatarFallback>
          </Avatar>

          <div className='min-w-0 flex-1'>
            <p
              aria-hidden
              className='font-ascii text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs'
            >
              <span className='text-landing-accent'>$</span>
              <span>whoami</span>
              <span className='text-foreground truncate'>
                {profile.username}
              </span>
              <span className='ascii-caret'>_</span>
            </p>
            <div className='mt-2 flex min-w-0 flex-wrap items-center gap-2'>
              <h1 className='truncate text-xl font-semibold tracking-(--tracking-display) sm:text-3xl'>
                {displayName}
              </h1>
              <StatusBadge
                label={getRoleLabel(profile.role)}
                variant='neutral'
                copyable={false}
              />
              <StatusBadge
                label={`${t('User ID')} ${profile.id}`}
                variant='info'
                copyText={String(profile.id)}
              />
            </div>
            {meta.length > 0 && (
              <p className='font-ascii text-muted-foreground mt-1.5 truncate text-xs'>
                {meta.join(' · ')}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className='border-border grid grid-cols-2 border-t sm:grid-cols-3'>
        {stats.map((item) => (
          <div
            key={item.key}
            className={cn(
              'border-border min-w-0 px-4 py-3.5 sm:px-6 sm:py-5',
              item.key === 'balance' &&
                'col-span-2 border-b sm:col-span-1 sm:border-b-0',
              item.key === 'usage' && 'sm:border-l',
              item.key === 'requests' && 'border-l'
            )}
          >
            <div className='flex min-w-0 items-center gap-1.5'>
              {item.key === 'balance' ? (
                <span aria-hidden className='relative flex size-1.5 shrink-0'>
                  <span className='bg-landing-accent absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping' />
                  <span className='bg-landing-accent relative size-1.5 rounded-full' />
                </span>
              ) : (
                <item.icon
                  className='text-muted-foreground size-3.5 shrink-0'
                  aria-hidden
                />
              )}
              <span className={cn(CONSOLE_EYEBROW, 'truncate')}>
                {item.label}
              </span>
            </div>
            <div
              className={cn(
                'font-ascii mt-2.5 truncate font-semibold tracking-tight tabular-nums sm:text-[1.75rem] sm:leading-tight',
                item.key === 'balance' ? 'text-2xl leading-tight' : 'text-base'
              )}
            >
              {item.value}
            </div>
            <div className='text-muted-foreground mt-1 hidden text-xs md:block'>
              {item.description}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
