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

import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { CONSOLE_EYEBROW, CONSOLE_FRAME } from '@/lib/console-surface'
import { formatNumber, formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { UserWalletData } from '../types'

interface WalletStatsCardProps {
  user: UserWalletData | null
  loading?: boolean
}

/** Balance, usage and request count in one hairline-ruled row. */
export function WalletStatsCard(props: WalletStatsCardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const stats = [
    {
      key: 'balance',
      label: t('Current Balance'),
      value: formatQuota(props.user?.quota ?? 0),
      description: t('Remaining quota'),
      icon: WalletCards,
    },
    {
      key: 'usage',
      label: t('Total Usage'),
      value: formatQuota(props.user?.used_quota ?? 0),
      description: t('Total consumed quota'),
      icon: BarChart3,
    },
    {
      key: 'requests',
      label: t('API Requests'),
      value: formatNumber(props.user?.request_count ?? 0, locale),
      description: t('Total requests made'),
      icon: Activity,
    },
  ]

  return (
    <section
      aria-busy={props.loading || undefined}
      className={cn(CONSOLE_FRAME, 'grid grid-cols-2 sm:grid-cols-3')}
    >
      {stats.map((item) => {
        const isBalance = item.key === 'balance'
        return (
          <div
            key={item.key}
            className={cn(
              'border-border relative min-w-0 overflow-hidden px-4 py-3.5 sm:px-6 sm:py-5',
              isBalance &&
                'bg-muted/30 col-span-2 border-b sm:col-span-1 sm:border-b-0',
              item.key === 'usage' && 'sm:border-l',
              item.key === 'requests' && 'border-l'
            )}
          >
            {isBalance && (
              <div
                aria-hidden
                className='ascii-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_90%_90%_at_0%_0%,black,transparent)] opacity-40'
              />
            )}
            <div className='relative flex min-w-0 items-center gap-1.5'>
              {isBalance ? (
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

            {props.loading ? (
              <Skeleton className='relative mt-2.5 h-6 w-full max-w-36 sm:h-8' />
            ) : (
              <div
                className={cn(
                  'font-ascii relative mt-2.5 font-semibold tracking-tight break-all tabular-nums sm:text-[1.75rem] sm:leading-tight',
                  isBalance ? 'text-2xl leading-tight' : 'text-base'
                )}
              >
                {item.value}
              </div>
            )}
            <div className='text-muted-foreground relative mt-1 hidden text-xs md:block'>
              {item.description}
            </div>
          </div>
        )
      })}
    </section>
  )
}
