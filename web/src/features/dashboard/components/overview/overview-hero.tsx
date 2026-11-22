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
import { ArrowRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import {
  EASE,
  LANDING_COLOR_VARS,
  landingAction,
} from '@/features/home/constants'
import { useCssColors } from '@/hooks/use-css-colors'
import { cn } from '@/lib/utils'

import { DASHBOARD_EYEBROW, DASHBOARD_FRAME } from '../../constants'

// WebGL glyph field pulls in three.js; keep it out of the dashboard chunk.
const GlyphSonar = lazy(() => import('@/components/react-bits/glyph-sonar'))

interface OverviewHeroProps {
  /** Login name, shown in the `whoami` line. */
  username: string
  /** Name used in the greeting. */
  displayName: string
  /** OpenAI-compatible base URL clients point at, e.g. `https://host/v1`. */
  baseUrl: string
  /** Models this account may call; `undefined` while loading. */
  modelCount?: number
}

/** Console greeting over the landing page's ASCII sonar field. */
export function OverviewHero(props: OverviewHeroProps) {
  const { t } = useTranslation()
  const reduce = useReducedMotion()
  const colors = useCssColors(LANDING_COLOR_VARS)

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className={cn(DASHBOARD_FRAME, 'bg-muted/30 relative')}
    >
      <div aria-hidden className='pointer-events-none absolute inset-0'>
        <div className='ascii-grid absolute inset-0 [mask-image:radial-gradient(ellipse_80%_90%_at_70%_0%,black,transparent)] opacity-40' />
        <div className='absolute inset-y-0 right-0 hidden w-[62%] [mask-image:radial-gradient(ellipse_70%_75%_at_60%_50%,black_20%,transparent_78%)] opacity-70 md:block'>
          <Suspense fallback={null}>
            <GlyphSonar
              className='size-full'
              colors={[colors.accent, colors.foreground]}
              backgroundColor={colors.background}
              originX={0.55}
              originY={0.5}
              glyphSize={12}
              interval={4.2}
              intensity={0.6}
              interactive={false}
              clickPing={false}
            />
          </Suspense>
        </div>
      </div>

      <div className='relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end lg:gap-10'>
        <div className='min-w-0'>
          <p
            aria-hidden
            className='font-ascii text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs'
          >
            <span className='text-landing-accent'>$</span>
            <span>whoami</span>
            <span className='text-foreground truncate'>{props.username}</span>
            <span className='ascii-caret'>_</span>
          </p>
          <p className='mt-4 text-[clamp(1.6rem,2.6vw,2.25rem)] leading-(--leading-heading) font-semibold tracking-(--tracking-display) text-balance'>
            <span className='block'>
              {t('Welcome back, {{name}}', { name: props.displayName })}
            </span>
            <span className='text-muted-foreground block'>
              {t('One key for every model.')}
            </span>
          </p>
          <div className='mt-6 flex flex-col gap-3 sm:flex-row'>
            <Link to='/playground' className={landingAction.primary}>
              {t('Open Playground')}
              <ArrowRight
                className='size-4 transition-transform duration-200 group-hover:translate-x-0.5'
                aria-hidden
              />
            </Link>
            <Link to='/usage-logs' className={landingAction.secondary}>
              {t('View usage logs')}
            </Link>
          </div>
        </div>

        <div className='border-border bg-background/80 flex min-w-0 flex-col gap-3 rounded-2xl border p-4 backdrop-blur'>
          <div className='flex items-center justify-between gap-2'>
            <span className={DASHBOARD_EYEBROW}>{t('Base URL')}</span>
            <span className='text-muted-foreground inline-flex items-center gap-1.5 text-[11px]'>
              <span aria-hidden className='relative flex size-1.5'>
                <span className='bg-landing-accent absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping' />
                <span className='bg-landing-accent relative size-1.5 rounded-full' />
              </span>
              {t('Gateway online')}
            </span>
          </div>
          <div className='bg-muted/60 flex min-w-0 items-center gap-2 rounded-xl py-1 pr-1 pl-3'>
            <code
              className='font-ascii min-w-0 flex-1 truncate text-xs'
              title={props.baseUrl}
            >
              {props.baseUrl}
            </code>
            <CopyButton
              value={props.baseUrl}
              size='sm'
              className='size-8'
              aria-label={t('Copy base URL')}
            />
          </div>
          <p className='font-ascii text-muted-foreground text-[11px]'>
            {props.modelCount === undefined
              ? '…'
              : t('{{count}} models available', { count: props.modelCount })}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
